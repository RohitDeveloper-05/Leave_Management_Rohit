process.env.USERS_TABLE = 'UsersTable';
process.env.LEAVE_REQUESTS_TABLE = 'LeaveRequestsTable';
process.env.SES_EMAIL = 'no-reply@example.com';

import { sendUserEmailHandler } from '../../lambdas/sendUserEmail';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

beforeEach(() => {
    ddbMock.reset();
    sesMock.reset();
});

describe('sendUserEmailHandler', () => {
    it('throws if leave request not found', async () => {
        // first GetCommand for leave request → no Item
        ddbMock.on(GetCommand).resolves({});

        await expect(sendUserEmailHandler({ leaveRequestId: 'req-1', status: 'approve' })).rejects.toThrow(
            'Leave request not found',
        );
    });

    it('throws if user not found', async () => {
        // 1) leave request exists
        ddbMock
            .on(GetCommand)
            .resolvesOnce({
                Item: {
                    leaveRequestId: 'req-2',
                    userId: 'u2',
                    startDate: '2025-07-01',
                    endDate: '2025-07-05',
                },
            })
            // 2) user missing
            .resolvesOnce({});

        await expect(sendUserEmailHandler({ leaveRequestId: 'req-2', status: 'reject' })).rejects.toThrow(
            'User not found',
        );
    });

    it('sends email and returns status on success', async () => {
        // 1) leave request
        ddbMock
            .on(GetCommand)
            .resolvesOnce({
                Item: {
                    leaveRequestId: 'req-3',
                    userId: 'u3',
                    startDate: '2025-08-10',
                    endDate: '2025-08-15',
                },
            })
            // 2) user
            .resolvesOnce({
                Item: { userId: 'u3', name: 'Carol', email: 'carol@example.com' },
            });

        // SES send
        sesMock.on(SendEmailCommand).resolves({ MessageId: 'msg-xyz' });

        const result = await sendUserEmailHandler({
            leaveRequestId: 'req-3',
            status: 'approve',
        });

        // Handler return
        expect(result).toEqual({ status: 'Email sent' });

        // One SES call
        expect(sesMock.calls()).toHaveLength(1);
        const [
            {
                args: [cmd],
            },
        ] = sesMock.calls();
        expect(cmd).toBeInstanceOf(SendEmailCommand);

        // Inspect email params
        const params = (cmd as SendEmailCommand).input;
        expect(params.Source).toBe('no-reply@example.com');
        expect(params.Destination).toBeDefined();
        expect(params.Destination!.ToAddresses).toEqual(['carol@example.com']);

        // Subject & body
        expect(params.Message).toBeDefined();
        expect(params.Message!.Subject!.Data).toBe('Leave Request Update');
        const text = params.Message!.Body!.Text!.Data;
        expect(text).toContain('Your leave request from 2025-08-10 to 2025-08-15 (ID: req-3) has been approve.');
    });
});
