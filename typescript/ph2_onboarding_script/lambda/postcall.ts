import axios from 'axios';

export const handler = async (event: any) => {
    const { ClusterName, CastAiClusterId, CastApiKey, AwsAccount, ArnPartition } = event;

    const roleName = `cast-eks-${ClusterName.slice(0, 30)}-cluster-role-${CastAiClusterId.slice(0, 8)}`;
    const RoleArn = `arn:${ArnPartition}:iam::${AwsAccount}:role/${roleName}`;
    const CastApiUrl = `https://api.cast.ai/v1/kubernetes/external-clusters/${CastAiClusterId}`;

    const requestBody = {
        eks: {
            assumeRoleArn: RoleArn,
        },
    };

    console.log('Request Body:', requestBody);

    try {
        console.log('******* Running post block *******');
        const response = await axios.post(CastApiUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CastApiKey,
            },
        });

        console.log('Response:', response.data);
        return {
            statusCode: 200,
            body: JSON.stringify(response.data),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
