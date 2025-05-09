process.env.USERS_TABLE = 'UsersTable';
process.env.LEAVE_REQUESTS_TABLE = 'LeaveRequestsTable';
process.env.SES_EMAIL = 'no-reply@example.com';

import { sendApprovalEmailHandler } from '../../lambdas/sendApprovalEmail';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

beforeEach(() => {
    ddbMock.reset();
    sesMock.reset();
});

function makeEvent(leaveRequestId: string, taskToken: string) {
    return { leaveRequestId, taskToken };
}

describe('sendApprovalEmailHandler', () => {
    it('throws if leave request not found', async () => {
        // First GetCommand (for leaveRequest) returns no Item
        ddbMock.on(GetCommand).resolves({});

        await expect(sendApprovalEmailHandler(makeEvent('req-1', 'token-1'))).rejects.toThrow(
            'Leave request not found',
        );
    });

    it('throws if user or approver not found', async () => {
        ddbMock
            // 1st call → leaveRequest exists
            .on(GetCommand)
            .resolvesOnce({
                Item: {
                    leaveRequestId: 'req-2',
                    userId: 'u1',
                    approverId: 'm1',
                    startDate: '2025-05-10',
                    endDate: '2025-05-11',
                },
            })
            // 2nd call → simulate user *missing*
            .resolvesOnce({})
            // 3rd call → approver exists
            .resolvesOnce({ Item: { userId: 'm1', email: 'mgr@example.com', name: 'Manager' } });

        await expect(sendApprovalEmailHandler(makeEvent('req-2', 'token-2'))).rejects.toThrow(
            'User or approver not found',
        );
    });

    it('sends email and returns messageId on success', async () => {
        // 1) leaveRequest
        ddbMock
            .on(GetCommand)
            .resolvesOnce({
                Item: {
                    leaveRequestId: 'req-3',
                    userId: 'u2',
                    approverId: 'm2',
                    startDate: '2025-06-01',
                    endDate: '2025-06-05',
                },
            })
            // 2) user
            .resolvesOnce({ Item: { userId: 'u2', name: 'Alice', email: 'alice@example.com' } })
            // 3) approver
            .resolvesOnce({ Item: { userId: 'm2', name: 'Bob', email: 'bob@example.com' } });

        // SES send
        sesMock.on(SendEmailCommand).resolves({ MessageId: 'msg-123' });

        const result = await sendApprovalEmailHandler({ leaveRequestId: 'req-3', taskToken: 'token-3' });

        // Check handler return
        expect(result).toEqual({ status: 'Email sent', messageId: 'msg-123' });

        // Verify SES was called with the right params
        expect(sesMock.calls()).toHaveLength(1);
        const [
            {
                args: [command],
            },
        ] = sesMock.calls();
        expect(command).toBeInstanceOf(SendEmailCommand);

        const params = (command as SendEmailCommand).input;
        expect(params.Destination).toBeDefined();
        expect(params.Message).toBeDefined();

        expect(params.Destination!.ToAddresses).toEqual(['bob@example.com']);
        expect(params.Message!.Subject!.Data).toBe('Leave Request Approval');
        expect(params.Message!.Body!.Text!.Data).toContain('"leaveRequestId": "req-3"');
        expect(params.Message!.Body!.Text!.Data).toContain('"taskToken": "token-3"');
    });
});
