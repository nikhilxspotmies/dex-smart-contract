
const testAuth = async () => {
    const email = 'test_signin_' + Math.random() + '@example.com';
    const password = 'password123';

    console.log('--- Testing Signup ---');
    try {
        const signupResponse = await fetch('http://localhost:8080/api/user/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                firstName: 'Test',
                lastName: 'Signin',
                email: email,
                password: password,
                walletAddress: '0xSignin' + Math.random()
            })
        });
        const signupData = await signupResponse.json();
        console.log('Signup Status:', signupResponse.status);
        if (signupResponse.status !== 201) {
            console.error('Signup Failed:', signupData);
            return;
        }
        console.log('Signup Success');
    } catch (e) {
        console.error('Signup Error:', e);
        return;
    }

    console.log('\n--- Testing Signin ---');
    try {
        const signinResponse = await fetch('http://localhost:8080/api/user/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });
        const signinData = await signinResponse.json();
        console.log('Signin Status:', signinResponse.status);
        console.log('Signin Data:', signinData);
    } catch (e) {
        console.error('Signin Error:', e);
    }
};

testAuth();
