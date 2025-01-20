export const handler = async (event) => {
    const ClusterName = process.env.ClusterName;
    const CastAiClusterId = process.env.CastAiClusterId;
    const AwsAccount = process.env.AwsAccount;
    const ArnPartition = process.env.ArnPartition;
    const CastApiKey = process.env.CastApiKey;
    const RoleName = `cast-eks-${ClusterName.slice(0, 30)}-cluster-role-${CastAiClusterId.slice(0, 8)}`;
    const RoleArn = `arn:${ArnPartition}:iam::${AwsAccount}:role/${RoleName}`;
    const CastApiUrl = `https://api.cast.ai/v1/kubernetes/external-clusters/${CastAiClusterId}`;

    const requestBody = {
        eks: {
            assumeRoleArn: RoleArn,
        },
    };

    console.log('Request Body:', requestBody);

    try {
        console.log('******* Running post block *******');
        const response = await fetch(CastApiUrl, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CastApiKey,
            }
        });
        const responseData = await response.text();
        const responseStatus = await response.status;
        console.log('statusCode', responseStatus);
        console.log('body', responseData);
        return {
            statusCode: responseStatus,
            body: responseData
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            body: JSON.stringify({ error: error.message }),
        };
    }
};