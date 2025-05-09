process.env.SECRET_KEY = 'test-secret';

import { authorizerHandler } from '../../lambdas/authorizer';
import * as jwt from 'jsonwebtoken';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

jest.mock('jsonwebtoken');

function createEvent(
    authToken: string,
    methodArn = 'arn:aws:execute-api:region:acct:rest/stage/GET/resource',
): APIGatewayTokenAuthorizerEvent {
    return {
        type: 'TOKEN',
        authorizationToken: authToken,
        methodArn,
    } as any;
}

describe('authorizerHandler', () => {
    const mockVerify = jwt.verify as jest.Mock;

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('denies when header is missing or not Bearer', async () => {
        const evt1 = createEvent('');
        const res1 = await authorizerHandler(evt1);
        expect(res1.policyDocument.Statement[0].Effect).toBe('Deny');

        const evt2 = createEvent('Token abc.def.ghi');
        const res2 = await authorizerHandler(evt2);
        expect(res2.policyDocument.Statement[0].Effect).toBe('Deny');
    });

    it('denies when JWT has wrong segment count', async () => {
        const evt = createEvent('Bearer too.few');
        const res = await authorizerHandler(evt);
        expect(res.policyDocument.Statement[0].Effect).toBe('Deny');
    });

    it('denies when jwt.verify throws', async () => {
        mockVerify.mockImplementation(() => {
            throw new Error('bad sig');
        });

        const fakeJwt = ['a', 'b', 'c'].join('.');
        const evt = createEvent(`Bearer ${fakeJwt}`);
        const res = await authorizerHandler(evt);
        expect(mockVerify).toHaveBeenCalledWith(fakeJwt, 'test-secret', { algorithms: ['HS256'] });
        expect(res.policyDocument.Statement[0].Effect).toBe('Deny');
    });

    it('allows when jwt.verify returns payload', async () => {
        const payload = { userId: 'u123', role: 'employee' };
        mockVerify.mockReturnValue(payload);

        const fakeJwt = ['a', 'b', 'c'].join('.');
        const evt = createEvent(`Bearer ${fakeJwt}`, 'arn:aws:execute-api:reg:acct:rest/prod/POST/apply-leave');
        const res = await authorizerHandler(evt);

        expect(mockVerify).toHaveBeenCalledWith(fakeJwt, 'test-secret', { algorithms: ['HS256'] });
        expect(res.principalId).toBe('u123');
        expect(res.policyDocument.Statement).toEqual([
            { Action: 'execute-api:Invoke', Effect: 'Allow', Resource: evt.methodArn },
        ]);
        expect(res.context).toEqual({ userId: 'u123', role: 'employee' });
    });
});
