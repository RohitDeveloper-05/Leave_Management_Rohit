import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const USERS_TABLE = process.env.USERS_TABLE;
const LEAVE_REQUESTS_TABLE = process.env.LEAVE_REQUESTS_TABLE;
const SES_EMAIL = process.env.SES_EMAIL;

// instantiate v3 clients
const ddbClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});

export const sendUserEmailHandler = async (event: {
    leaveRequestId: string;
    status: 'approve' | 'reject';
}): Promise<{ status: string }> => {
    const { leaveRequestId, status } = event;

    // 1) Fetch the leave request
    const { Item: lr } = await dynamoDb.send(
        new GetCommand({
            TableName: LEAVE_REQUESTS_TABLE,
            Key: { leaveRequestId },
        }),
    );
    if (!lr) {
        throw new Error('Leave request not found');
    }

    // 2) Fetch user
    const { Item: user } = await dynamoDb.send(
        new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId: lr.userId },
        }),
    );
    if (!user) {
        throw new Error('User not found');
    }

    // 3) Send the email
    const emailParams = {
        Source: SES_EMAIL, // must be SES-verified!
        Destination: { ToAddresses: [user.email] },
        Message: {
            Subject: { Data: 'Leave Request Update' },
            Body: {
                Text: {
                    Data: `Your leave request from ${lr.startDate} to ${lr.endDate} (ID: ${leaveRequestId}) has been ${status}.`,
                },
            },
        },
    };

    const { MessageId } = await ses.send(new SendEmailCommand(emailParams));

    console.log('Email sent, MessageId:', MessageId);

    return { status: 'Email sent' };
};
