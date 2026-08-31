# Google Sign-In / Sign-Up

## Frontend flow
Use Google Identity Services in the browser. When Google returns a credential/ID token, send it to:

`POST /purse/v1/auth/google`

with:

```json
{ "idToken": "<Google ID token>" }
```

The browser must use `credentials: 'include'` so the backend can establish Secure/HttpOnly Purse cookies.

## Backend verification
The backend uses Google's Node authentication library to verify the ID token. It checks:
- signature;
- configured `GOOGLE_CLIENT_ID` audience;
- issuer (`accounts.google.com` / `https://accounts.google.com`);
- `email_verified === true`;
- Google account subject (`sub`).

Google's current documentation recommends server-side ID-token verification and explicitly calls for checking the audience, issuer and expiry/cryptographic validity. The Node.js verification library provides `verifyIdToken()`. 

## Account behavior
- New Google identity: create an active `CUSTOMER` account.
- Existing Purse account with the same verified Google email: link Google to that user rather than creating a duplicate.
- Existing linked Google identity: sign the existing user in.
- Suspended/inactive users are rejected.
- The Google ID token is never stored.
- Google access/refresh tokens are not required because this feature is authentication, not Google API access.

## Environment

```env
GOOGLE_CLIENT_ID=your_google_web_client_id
```

Configure the Google OAuth client in Google Cloud Console and use the same web client ID in the frontend and backend verification configuration.
