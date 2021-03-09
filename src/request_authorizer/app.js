exports.lambdaHandler = async (event, context, callback) => {
    const token = event.queryStringParameters.token;
    switch (token) {
        case process.env.TOKEN:
            callback(null, generatePolicy('me', 'Allow', event.methodArn));
        default:
            callback('Unauthorized');
    }
};

const generatePolicy = (principalId, effect, resource) => {
    let authResponse = {
        principalId,
    };

    if (effect && resource) {
        authResponse.policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: resource,
                },
            ],
        };
    }

    return authResponse;
};
