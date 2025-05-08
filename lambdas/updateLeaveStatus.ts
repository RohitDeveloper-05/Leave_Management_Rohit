import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const LEAVE_REQUESTS_TABLE = process.env.LEAVE_REQUESTS_TABLE;

// instantiate v3 clients
const ddbClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(ddbClient);

export const updateLeaveStatusHandler = async (event: {
    leaveRequestId: string;
    status: 'approve' | 'reject';
}): Promise<{ status: string; leaveRequestId: string }> => {
    const { leaveRequestId, status } = event;

    await dynamoDb.send(
        new UpdateCommand({
            TableName: LEAVE_REQUESTS_TABLE,
            Key: { leaveRequestId },
            UpdateExpression: 'SET #st = :s',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: { ':s': status },
        }),
    );

    // Returning tells Lambda “success”
    return { status, leaveRequestId };
};
