import * as jwt from 'jsonwebtoken';

const SECRET_KEY = 'ROH_LEAVE'; // Must match the secret key in your authorizer Lambda

// Payload for an employee token
const employeePayload = {
    userId: '12345', // Replace with a valid userId from your Users table
    role: 'employee', // Role for applying leave
};

// Payload for a manager token
const managerPayload = {
    userId: '67890', // Replace with a valid manager userId from your Users table
    role: 'manager', // Role for approving/rejecting leave
};

// Generate tokens
const employeeToken = jwt.sign(employeePayload, SECRET_KEY, {
    expiresIn: '1h',
});
const managerToken = jwt.sign(managerPayload, SECRET_KEY, { expiresIn: '1h' });

console.log('Employee Token:', employeeToken);
console.log('Manager Token:', managerToken);
