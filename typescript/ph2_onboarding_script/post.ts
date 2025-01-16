import axios from 'axios';

const sendPostRequest = async () => {
  // Insert the role ARN created earlier
  const ROLE_ARN = "arn:aws:iam::123456789012:role/YourRoleName";
  
  // Insert the castai cluster ID
  const CLUSTER_ID = "<<CLUSTER_ID>>"
  const CAST_API_KEY = "<<CAST_API_KEY>>"

  // API endpoint
  const url = `https://api.cast.ai/v1/kubernetes/external-clusters/${CLUSTER_ID}`;

  // Request body
  const requestBody = {
    eks: {
      assumeRoleArn: ROLE_ARN
    }
  };

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CAST_API_KEY,
      },
    });

    console.log('Response:', response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error:', error.response?.data || error.message);
    } else {
      console.error('Unexpected Error:', error);
    }
  }
};

sendPostRequest();