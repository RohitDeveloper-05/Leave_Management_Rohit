import { approveLeaveHandler } from '../../lambdas/approveLeave';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';

const sfnMock = mockClient(SFNClient);

beforeEach(() => {
    sfnMock.reset();
});

function makeEvent(body: string): APIGatewayProxyEvent {
    return {
        body,
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/approve-leave',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
    };
}

describe('approveLeaveHandler', () => {
    it('returns 400 if any field is missing', async () => {
        const evt = makeEvent('leaveRequestId=req1&action=approve');
        const res = await approveLeaveHandler(evt);
        expect(res.statusCode).toBe(400);
        expect(res.headers!['Content-Type']).toBe('application/json');
        const body = JSON.parse(res.body);
        expect(body).toEqual({ message: 'Missing leaveRequestId, action or taskToken' });
    });

    it('calls SendTaskSuccessCommand and returns 200 on success', async () => {
        sfnMock.on(SendTaskSuccessCommand).resolves({});

        const payload = 'leaveRequestId=req-2&action=reject&taskToken=tok-2';
        const evt = makeEvent(payload);
        const res = await approveLeaveHandler(evt);

        expect(res.statusCode).toBe(200);
        expect(res.headers!['Content-Type']).toBe('application/json');
        const body = JSON.parse(res.body);
        expect(body).toEqual({
            message: 'Action submitted',
            data: { leaveRequestId: 'req-2', action: 'reject' },
        });

        expect(sfnMock.calls()).toHaveLength(1);
        const [
            {
                args: [cmd],
            },
        ] = sfnMock.calls();
        expect(cmd).toBeInstanceOf(SendTaskSuccessCommand);

        const input = (cmd as SendTaskSuccessCommand).input;
        expect(input.taskToken).toBe('tok-2');

        const output = JSON.parse(input.output!);
        expect(output).toEqual({ status: 'reject', leaveRequestId: 'req-2' });
    });

    it('propagates errors from Step Functions', async () => {
        sfnMock.on(SendTaskSuccessCommand).rejects(new Error('SFN error'));

        const evt = makeEvent('leaveRequestId=req3&action=approve&taskToken=tok-3');
        await expect(approveLeaveHandler(evt)).rejects.toThrow('SFN error');
    });
});
