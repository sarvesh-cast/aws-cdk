import axios from 'axios';

const sendPostRequest = async () => {
  const ROLE_ARN = "arn:aws:iam::050451381948:role/cast-eks-eks-10101-sar-cluster-role-9f3e2cc0";

  const CLUSTER_ID = "9f3e2cc0-8c14-411c-9208-ae8bb18986cb"
  const CAST_API_KEY = "<Add API KEY>"

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