// Trusted operator configuration. Never obtain the API endpoint from a URL,
// uploaded file, mod message or a user-supplied deep link. No credentials here.
export const config = {
  clientId: 'replace-with-registered-client',
  apiBaseUrl: '', // Fixed HTTPS gamePartnerApi endpoint supplied by VYBE.
};
