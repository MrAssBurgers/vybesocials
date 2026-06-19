/**
 * FriendDrop Native Plugin for Android
 * Uses Google Nearby Connections API for peer-to-peer discovery
 * 
 * INSTALLATION:
 * 1. Copy this file to: android/app/src/main/java/app/lovable/plugins/FriendDropPlugin.kt
 * 2. Add to build.gradle (app level):
 *    implementation 'com.google.android.gms:play-services-nearby:19.0.0'
 * 3. Add permissions to AndroidManifest.xml (see native/android/AndroidManifest.xml):
 *    <uses-permission android:name="android.permission.NFC" />
 *    <uses-feature android:name="android.hardware.nfc" android:required="false" />
 *    <uses-permission android:name="android.permission.BLUETOOTH" />
 *    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
 *    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
 *    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
 *    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
 *    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
 *    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
 *    <uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
 * 4. Register plugin in MainActivity.java:
 *    registerPlugin(FriendDropPlugin::class.java)
 */

package app.lovable.plugins

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.JSObject
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.*

@CapacitorPlugin(name = "FriendDrop")
class FriendDropPlugin : Plugin() {
    
    private val SERVICE_ID = "app.vybe.frienddrop"
    private lateinit var connectionsClient: ConnectionsClient
    private var userInfo: Map<String, String> = emptyMap()
    private val discoveredEndpoints = mutableMapOf<String, Map<String, String>>()
    
    override fun load() {
        connectionsClient = Nearby.getConnectionsClient(context)
    }
    
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }
    
    @PluginMethod
    fun startAdvertising(call: PluginCall) {
        val userId = call.getString("userId") ?: run {
            call.reject("Missing userId")
            return
        }
        val username = call.getString("username") ?: run {
            call.reject("Missing username")
            return
        }
        
        userInfo = mapOf(
            "userId" to userId,
            "username" to username,
            "displayName" to (call.getString("displayName") ?: ""),
            "avatarUrl" to (call.getString("avatarUrl") ?: "")
        )
        
        val advertisingOptions = AdvertisingOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()
        
        // Encode user info in the endpoint name
        val endpointName = "$username|$userId"
        
        connectionsClient.startAdvertising(
            endpointName,
            SERVICE_ID,
            connectionLifecycleCallback,
            advertisingOptions
        ).addOnSuccessListener {
            call.resolve()
        }.addOnFailureListener { e ->
            call.reject("Failed to start advertising: ${e.message}")
        }
    }
    
    @PluginMethod
    fun stopAdvertising(call: PluginCall) {
        connectionsClient.stopAdvertising()
        call.resolve()
    }
    
    @PluginMethod
    fun startBrowsing(call: PluginCall) {
        val discoveryOptions = DiscoveryOptions.Builder()
            .setStrategy(Strategy.P2P_CLUSTER)
            .build()
        
        connectionsClient.startDiscovery(
            SERVICE_ID,
            endpointDiscoveryCallback,
            discoveryOptions
        ).addOnSuccessListener {
            call.resolve()
        }.addOnFailureListener { e ->
            call.reject("Failed to start discovery: ${e.message}")
        }
    }
    
    @PluginMethod
    fun stopBrowsing(call: PluginCall) {
        connectionsClient.stopDiscovery()
        call.resolve()
    }
    
    @PluginMethod
    fun acceptPeer(call: PluginCall) {
        val peerId = call.getString("peerId") ?: run {
            call.reject("Missing peerId")
            return
        }
        
        connectionsClient.requestConnection(
            userInfo["username"] ?: "Unknown",
            peerId,
            connectionLifecycleCallback
        ).addOnSuccessListener {
            call.resolve()
        }.addOnFailureListener { e ->
            call.reject("Failed to connect: ${e.message}")
        }
    }
    
    @PluginMethod
    fun rejectPeer(call: PluginCall) {
        call.resolve()
    }
    
    private val endpointDiscoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            // Parse endpoint name: "username|userId"
            val parts = info.endpointName.split("|")
            if (parts.size >= 2) {
                val peerInfo = mapOf(
                    "username" to parts[0],
                    "userId" to parts[1]
                )
                discoveredEndpoints[endpointId] = peerInfo
                
                val peer = JSObject()
                peer.put("peerId", endpointId)
                peer.put("userId", parts[1])
                peer.put("username", parts[0])
                peer.put("displayName", null as String?)
                peer.put("avatarUrl", null as String?)
                
                val data = JSObject()
                data.put("peer", peer)
                
                notifyListeners("peerFound", data)
            }
        }
        
        override fun onEndpointLost(endpointId: String) {
            discoveredEndpoints.remove(endpointId)
            
            val data = JSObject()
            data.put("peerId", endpointId)
            notifyListeners("peerLost", data)
        }
    }
    
    private val connectionLifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            // Auto-accept connections for seamless experience
            connectionsClient.acceptConnection(endpointId, payloadCallback)
        }
        
        override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {
            if (result.status.isSuccess) {
                val peerInfo = discoveredEndpoints[endpointId]
                
                val peer = JSObject()
                peer.put("peerId", endpointId)
                peer.put("userId", peerInfo?.get("userId") ?: "")
                peer.put("username", peerInfo?.get("username") ?: "")
                peer.put("displayName", null as String?)
                peer.put("avatarUrl", null as String?)
                
                val data = JSObject()
                data.put("peer", peer)
                
                notifyListeners("peerConnected", data)
            } else {
                val data = JSObject()
                data.put("peerId", endpointId)
                data.put("error", result.status.statusMessage ?: "Connection failed")
                notifyListeners("connectionFailed", data)
            }
        }
        
        override fun onDisconnected(endpointId: String) {
            val data = JSObject()
            data.put("peerId", endpointId)
            notifyListeners("peerLost", data)
        }
    }
    
    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            // Handle received data if needed
        }
        
        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            // Handle transfer updates if needed
        }
    }
}
