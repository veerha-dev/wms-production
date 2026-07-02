import axios from 'axios';

const backendUrl = 'https://veerha-wms-backend.onrender.com/api/v1';

async function run() {
  const randomEmail = `test-${Date.now()}@example.com`;
  console.log(`Signing up user with email: ${randomEmail}`);

  try {
    const signupRes = await axios.post(`${backendUrl}/auth/signup`, {
      email: randomEmail,
      fullName: 'Test User',
      password: 'password123',
    });

    console.log('✅ Signup successful!');
    const token = signupRes.data.data.accessToken;
    console.log('Token:', token);

    console.log('Querying warehouses with token...');
    const warehousesRes = await axios.get(`${backendUrl}/warehouses`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('✅ Warehouses query successful!');
    console.log('Data:', warehousesRes.data);

  } catch (error: any) {
    console.error('❌ Request failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.log('Body:', error.response.data);
    } else {
      console.error('Error message:', error.message);
    }
  }
}

run();
