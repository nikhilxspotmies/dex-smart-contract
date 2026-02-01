
const signup = async () => {
    try {
        const response = await fetch('http://localhost:8080/api/user/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                firstName: 'Test',
                lastName: 'User',
                email: 'test' + Math.random() + '@example.com',
                password: 'password123',
                walletAddress: '0xTestWalletAddress' + Math.random() // Randomize to allow multiple runs
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Data:', data);
    } catch (error) {
        console.error('Error:', error);
    }
};

signup();
