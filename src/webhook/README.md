# RFQA/Zephyr Integration

## Guidelines on test key:
- Should include Zephyr test case ID in RFQA's test name
- RFQA's test name could have multiple test case IDs
- Lambda function does not support multiple test steps currently and so, RFQA's test name should not indicate like we used to do in Cypress (adding step number as suffix ex. `MM-T123_1`)

## Guidelines on test group or run group:
- Limit the number to 100 test cases maximum

## Steps to enable integration before the scheduled test run in RFQA 
1. Create a test cycle in Zephyr and take note of its ID (ex. `MM-R1141`)
2. Go to [RFQA Sites](https://app.rainforestqa.com/settings/sites) and click `Staging`.
3. Enable webhook and change query parameter to indicate test cycle ID (ex. `https://lambdaid.execute-api.us-east-1.amazonaws.com/prod/rfqa?cycle=MM-R1141&token=secrettoken`)
