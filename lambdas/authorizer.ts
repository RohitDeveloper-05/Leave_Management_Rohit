import * as jwt from 'jsonwebtoken';
import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

const SECRET_KEY = process.env.SECRET_KEY!;

export const authorizerHandler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    const authHeader = event.authorizationToken;
    if (!authHeader?.startsWith('Bearer ')) {
        console.error('Bad auth header:', authHeader);
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = authHeader.slice(7).trim(); // remove "Bearer "
    const parts = token.split('.');
    if (parts.length !== 3) {
        console.error('Malformed JWT, got parts:', parts.length);
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    console.log(' Printing Token', token);

    try {
        const decoded = jwt.verify(token, SECRET_KEY, {
            algorithms: ['HS256'],
        }) as unknown as {
            userId: string;
            role: string;
        };

        console.log('decoded', decoded);
        return generatePolicy(decoded.userId, 'Allow', event.methodArn, {
            userId: decoded.userId,
            role: decoded.role,
        });
    } catch (error) {
        console.log('Printing Error', error);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(
    principalId: string,
    effect: string,
    resource: string,
    context?: any,
): APIGatewayAuthorizerResult {
    if (effect !== 'Allow' && effect !== 'Deny') {
        throw new Error(`Invalid effect: ${effect}`);
    }
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
        },
        context,
    };
}
