/**
 * FriendDrop Native Plugin for iOS
 * Uses MultipeerConnectivity for peer-to-peer discovery
 * 
 * INSTALLATION:
 * 1. Copy this file to: ios/App/App/Plugins/FriendDropPlugin.swift
 * 2. Add to Info.plist:
 *    <key>NSLocalNetworkUsageDescription</key>
 *    <string>VYBE uses local network to discover nearby friends</string>
 *    <key>NSBonjourServices</key>
 *    <array>
 *      <string>_vybe-frienddrop._tcp</string>
 *    </array>
 * 3. Register plugin in AppDelegate.swift:
 *    Bridge.addPlugin(FriendDropPlugin.self)
 */

import Foundation
import Capacitor
import MultipeerConnectivity

@objc(FriendDropPlugin)
public class FriendDropPlugin: CAPPlugin, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate, MCSessionDelegate {
    
    private let serviceType = "vybe-frienddrop"
    private var peerID: MCPeerID!
    private var session: MCSession!
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    private var userInfo: [String: String] = [:]
    private var discoveredPeers: [MCPeerID: [String: String]] = [:]
    
    public override func load() {
        peerID = MCPeerID(displayName: UIDevice.current.name)
        session = MCSession(peer: peerID, securityIdentity: nil, encryptionPreference: .required)
        session.delegate = self
    }
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }
    
    @objc func startAdvertising(_ call: CAPPluginCall) {
        guard let userId = call.getString("userId"),
              let username = call.getString("username") else {
            call.reject("Missing user info")
            return
        }
        
        userInfo = [
            "userId": userId,
            "username": username,
            "displayName": call.getString("displayName") ?? "",
            "avatarUrl": call.getString("avatarUrl") ?? ""
        ]
        
        advertiser = MCNearbyServiceAdvertiser(peer: peerID, discoveryInfo: userInfo, serviceType: serviceType)
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()
        
        call.resolve()
    }
    
    @objc func stopAdvertising(_ call: CAPPluginCall) {
        advertiser?.stopAdvertisingPeer()
        advertiser = nil
        call.resolve()
    }
    
    @objc func startBrowsing(_ call: CAPPluginCall) {
        browser = MCNearbyServiceBrowser(peer: peerID, serviceType: serviceType)
        browser?.delegate = self
        browser?.startBrowsingForPeers()
        call.resolve()
    }
    
    @objc func stopBrowsing(_ call: CAPPluginCall) {
        browser?.stopBrowsingForPeers()
        browser = nil
        call.resolve()
    }
    
    @objc func acceptPeer(_ call: CAPPluginCall) {
        guard let peerIdString = call.getString("peerId"),
              let peer = discoveredPeers.keys.first(where: { $0.displayName == peerIdString }) else {
            call.reject("Peer not found")
            return
        }
        
        browser?.invitePeer(peer, to: session, withContext: nil, timeout: 30)
        call.resolve()
    }
    
    @objc func rejectPeer(_ call: CAPPluginCall) {
        // Just don't invite them
        call.resolve()
    }
    
    // MARK: - MCNearbyServiceBrowserDelegate
    
    public func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String : String]?) {
        guard let info = info else { return }
        
        discoveredPeers[peerID] = info
        
        let peerData: [String: Any] = [
            "peer": [
                "peerId": peerID.displayName,
                "userId": info["userId"] ?? "",
                "username": info["username"] ?? "",
                "displayName": info["displayName"],
                "avatarUrl": info["avatarUrl"]
            ]
        ]
        
        notifyListeners("peerFound", data: peerData)
    }
    
    public func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        discoveredPeers.removeValue(forKey: peerID)
        notifyListeners("peerLost", data: ["peerId": peerID.displayName])
    }
    
    // MARK: - MCNearbyServiceAdvertiserDelegate
    
    public func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        // Auto-accept invitations for seamless experience
        invitationHandler(true, session)
    }
    
    // MARK: - MCSessionDelegate
    
    public func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        if state == .connected, let info = discoveredPeers[peerID] {
            let peerData: [String: Any] = [
                "peer": [
                    "peerId": peerID.displayName,
                    "userId": info["userId"] ?? "",
                    "username": info["username"] ?? "",
                    "displayName": info["displayName"],
                    "avatarUrl": info["avatarUrl"]
                ]
            ]
            
            DispatchQueue.main.async {
                self.notifyListeners("peerConnected", data: peerData)
            }
        }
    }
    
    public func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        // Handle received data if needed
    }
    
    public func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
    public func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
    public func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
