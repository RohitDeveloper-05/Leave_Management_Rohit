process.env.LEAVE_REQUESTS_TABLE = 'LeaveRequestsTable';

import { updateLeaveStatusHandler } from '../../lambdas/updateLeaveStatus';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('updateLeaveStatusHandler', () => {
    beforeEach(() => {
        ddbMock.reset();
    });

    it('calls UpdateCommand and returns status on success', async () => {
        ddbMock.on(UpdateCommand).resolves({});

        const input = { leaveRequestId: 'req-123', status: 'approve' as const };
        const result = await updateLeaveStatusHandler(input);

        expect(result).toEqual({ leaveRequestId: 'req-123', status: 'approve' });

        expect(ddbMock.calls()).toHaveLength(1);
        const [
            {
                args: [command],
            },
        ] = ddbMock.calls();
        expect(command).toBeInstanceOf(UpdateCommand);

        const params = (command as UpdateCommand).input;
        expect(params.TableName).toBe('LeaveRequestsTable');
        expect(params.Key).toEqual({ leaveRequestId: 'req-123' });
        expect(params.UpdateExpression).toBe('SET #st = :s');
        expect(params.ExpressionAttributeNames).toEqual({ '#st': 'status' });
        expect(params.ExpressionAttributeValues).toEqual({ ':s': 'approve' });
    });

    it('propagates errors from DynamoDB', async () => {
        ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

        const input = { leaveRequestId: 'req-456', status: 'reject' as const };
        await expect(updateLeaveStatusHandler(input)).rejects.toThrow('DynamoDB error');
    });
});
