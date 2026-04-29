# Sumsub KYC Integration Guide (Amerox Web App)

This document outlines the step-by-step process for integrating Sumsub KYC/AML services into the Amerox ecosystem (React Frontend + Node.js Backend).

## 1. Prerequisites (Sumsub Dashboard)
Before writing code, ensure you have the following from the [Sumsub Dashboard](https://dashboard.sumsub.com/):
- **App Token**: Found in `Dev Space > App Tokens`.
- **Secret Key**: Generated with the App Token.
- **Verification Level**: Created in `Product Settings > Verification Levels` (e.g., named `basic-kyc-level`).
- **Webhook URL**: Your backend endpoint (e.g., `https://api.amerox.com/api/kyc/webhook`).

---

## 2. Environment Variables

### Backend (`dex-smart-contract/backend/.env`)
```env
SUMSUB_APP_TOKEN=your_app_token_here
SUMSUB_SECRET_KEY=your_secret_key_here
SUMSUB_LEVEL_NAME=basic-kyc-level
SUMSUB_BASE_URL=https://api.sumsub.com
```

### Frontend (`Amerox-dex/.env`)
```env
VITE_BACKEND_URL=https://api.amerox.com
```

---

## 3. Backend Implementation (Node.js/TS)

### Install SDK
```bash
npm install sumsub-node-sdk
```

### Flow A: Generate Access Token
The frontend calls this endpoint to get a temporary token. This keeps your `Secret Key` hidden from the browser.

```typescript
// backend/src/routes/kyc.ts
import { sdk } from 'sumsub-node-sdk';

const sumsub = sdk({
  baseURL: process.env.SUMSUB_BASE_URL,
  appToken: process.env.SUMSUB_APP_TOKEN,
  secretKey: process.env.SUMSUB_SECRET_KEY,
});

router.get('/generate-token', async (req, res) => {
  const externalUserId = req.user.walletAddress; // Unique ID for the user
  const levelName = process.env.SUMSUB_LEVEL_NAME;

  try {
    // Generates a token valid for 30 mins
    const accessToken = await sumsub.generateAccessToken(externalUserId, levelName, 1800);
    res.json({ token: accessToken.token });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Sumsub token' });
  }
});
```

### Flow B: Webhook Handler
Sumsub calls this when the user's status changes (e.g., approved/rejected).

```typescript
// backend/src/routes/kyc.ts
router.post('/webhook', async (req, res) => {
  const { type, externalUserId, reviewStatus, reviewResult } = req.body;

  if (type === 'applicantReviewed') {
    const isApproved = reviewResult.reviewAnswer === 'GREEN';
    
    // Update your database
    await User.updateOne(
      { walletAddress: externalUserId },
      { kycStatus: isApproved ? 'VERIFIED' : 'REJECTED' }
    );
  }
  
  res.sendStatus(200);
});
```

---

## 4. Frontend Implementation (React)

### Install SDK
```bash
npm install @sumsub/websdk-react
```

### Integrate Widget
```tsx
import SumsubWebSdk from '@sumsub/websdk-react';

const KycVerification = () => {
  const [token, setToken] = useState<string>('');

  const fetchToken = async () => {
    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/kyc/generate-token`);
    const data = await res.json();
    setToken(data.token);
  };

  useEffect(() => { fetchToken(); }, []);

  return (
    <div id="sumsub-widget">
      {token && (
        <SumsubWebSdk
          accessToken={token}
          expirationHandler={fetchToken} // Refresh token if it expires
          onMessage={(type, payload) => {
            console.log('Sumsub Message:', type, payload);
          }}
          onError={(error) => console.error('Sumsub Error:', error)}
        />
      )}
    </div>
  );
};
```

---

## 5. Restriction Logic (Security)

### How to Block Access
1.  **Backend Gatekeeper**: Every sensitive API call (Trade, Withdraw) must check the user's `kycStatus` in your database.
    ```typescript
    if (user.kycStatus !== 'VERIFIED') throw new Error("KYC required");
    ```
2.  **Frontend Protection**: Wrap restricted pages with a check.
    ```tsx
    if (user.kycStatus !== 'VERIFIED') return <Navigate to="/kyc" />;
    ```

## 6. Testing (Sandbox)
- Use your **Sandbox** credentials from Sumsub.
- Use the **Test Documents** provided in Sumsub documentation (sample passports/IDs) to simulate different results (Success, Rejection, Re-upload).
