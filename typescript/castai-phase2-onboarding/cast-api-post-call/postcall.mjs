export const handler = async (event) => {
    const CastAiClusterId = process.env.CastAiClusterId;
    const CastApiKey = process.env.CastApiKey;
    const IamRoleArn = process.env.IamRoleArn;
    const CastApiUrl = `https://api.cast.ai/v1/kubernetes/external-clusters/${CastAiClusterId}`;

    const requestBody = {
        eks: {
            assumeRoleArn: IamRoleArn,
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