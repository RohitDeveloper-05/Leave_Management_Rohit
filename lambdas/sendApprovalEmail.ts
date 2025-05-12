import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// keep your constants as before
const USERS_TABLE = process.env.USERS_TABLE;
const LEAVE_REQUESTS_TABLE = process.env.LEAVE_REQUESTS_TABLE;
const SES_EMAIL = process.env.SES_EMAIL;

// instantiate v3 clients
const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);
const ses = new SESClient({});

export const sendApprovalEmailHandler = async (event: {
    leaveRequestId: string;
    taskToken: string;
}): Promise<{ status: string; messageId: string }> => {
    const { leaveRequestId, taskToken } = event;

    // 1. Fetch leave request
    const { Item: leaveRequest } = await ddb.send(
        new GetCommand({
            TableName: LEAVE_REQUESTS_TABLE,
            Key: { leaveRequestId },
        }),
    );
    if (!leaveRequest) {
        throw new Error('Leave request not found');
    }

    // 2. Fetch user & approver in parallel
    const [{ Item: user }, { Item: approver }] = await Promise.all([
        ddb.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: leaveRequest.userId },
            }),
        ),
        ddb.send(
            new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: leaveRequest.approverId },
            }),
        ),
    ]);

    if (!user || !approver) {
        throw new Error('User or approver not found');
    }

    // 3. Construct email bodies
    const textBody = `Approve or reject leave ${leaveRequestId} by POST /approveLeave with:
    {
    "leaveRequestId": "${leaveRequestId}",
    "action": "approve"|"reject",
    "taskToken": "${taskToken}"
    }`;

    const htmlBody = `
    <p>
    ${user.name} has requested leave from ${leaveRequest.startDate} to ${leaveRequest.endDate}.
    Please approve or reject the leave request ${leaveRequestId}.
    </p>
    <form method="POST" action="https://pudpige5ff.execute-api.us-east-1.amazonaws.com/prod/approveLeave">
    <input type="hidden" name="leaveRequestId" value="${leaveRequestId}">
    <input type="hidden" name="taskToken" value="${taskToken}">
    <button type="submit" name="action" value="approve" style="background-color: green; color: white;">Approve</button>
    <button type="submit" name="action" value="reject" style="background-color: red; color: white;">Reject</button>
    </form>
    `;

    console.log('Printing the Source Email', SES_EMAIL);
    console.log('Printing the Destination Email', approver.email);

    // 4. Send the email
    const emailParams = {
        Source: SES_EMAIL, // must be verified in SES!
        Destination: { ToAddresses: [approver.email] },
        Message: {
            Subject: { Data: 'Leave Request Approval' },
            Body: {
                Html: { Data: htmlBody },
                Text: { Data: textBody },
            },
        },
    };

    const { MessageId } = await ses.send(new SendEmailCommand(emailParams));

    console.log('Email sent, MessageId:', MessageId);

    return { status: 'Email sent', messageId: MessageId! };
};
