const fetch = require('node-fetch');

const resultsObj = {
    passed: 'Pass',
    failed: 'Fail',
};

const getRfqaRunDetail = async (runId) => {
    const response = await fetch(`https://app.rainforestqa.com/api/1/runs/${runId}`, {
        headers: {CLIENT_TOKEN: process.env.RFQA_API_KEY},
    });
    const data = await response.json();
    return data;
};

const getRfqaExecutionDetail = async (runId) => {
    const response = await fetch(`https://app.rainforestqa.com/api/1/runs/${runId}/tests?page=1&page_size=100`, {
        headers: {CLIENT_TOKEN: process.env.RFQA_API_KEY},
    });
    const data = await response.json();
    return data;
};

const saveTestExecutionToZephyr = async (executionId, title, testExecution) => {
    const response = await fetch('https://api.adaptavist.io/tm4j/v2/testexecutions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Authorization: process.env.ZEPHYR_API_KEY,
        },
        body: JSON.stringify(testExecution),
    });

    const data = await response.json();

    return {
        executionId,
        title,
        testCaseKey: testExecution.testCaseKey,
        ...data,
    };
};

const saveTestExecutionsToZephyr = async (testCycleKey, executionDetails) => {
    const reTestKey = /(MM-T(\w+)\s)/g;
    const promises = [];

    executionDetails.forEach((executionDetail) => {
        const {
            id,
            browsers,
            created_at: createdAt,
            frontend_url: frontendUrl,
            result,
            title,
            updated_at: updatedAt,
        } = executionDetail;

        const matchAll = [...title.matchAll(reTestKey)];
        matchAll &&
            matchAll.forEach((match) => {
                const testKey = match[0].trim();
                const testExecution = {
                    projectKey: process.env.JIRA_PROJECT_KEY,
                    testCaseKey: testKey,
                    testCycleKey,
                    statusName: resultsObj[result],
                    // testScriptResults, // TODO: need to discuss
                    // environmentName: '', // TODO: need to discuss
                    actualEndDate: updatedAt,
                    executionTime: (new Date(updatedAt).getTime() - new Date(createdAt).getTime()) / 1000,
                    comment: `RFQA automated test (see ${frontendUrl}), Environment: ${browsers
                        .filter((b) => b.state === 'complete')
                        .map((b) => `${b.description} (${b.result} ${b.result === 'passed' ? '✅' : ''})`)
                        .join(', ')}`,
                };

                promises.push(saveTestExecutionToZephyr(id, title, testExecution));
            });
    });

    const data = await Promise.all(promises);
    return data;
};

const generateTestReport = (runDetail, recordedExecutions, executions, testCycle) => {
    const recordedObj = recordedExecutions.reduce((acc, item) => {
        if (acc[item.title]) {
            acc[item] += `\n - ${item.testCaseKey} ${item.message || ''}`;
        } else {
            acc[item.title] = `\n - ${item.testCaseKey} ${item.message || ''}`;
        }

        return acc;
    }, {});

    let withTestExecutionsRecorded = false;
    for (const recordedExecution of recordedExecutions) {
        if (!withTestExecutionsRecorded && !recordedExecution.errorCode) {
            withTestExecutionsRecorded = true;
        }
    }

    let testKeyMessage = '';
    const numberOfExecutions = executions.length;
    const numberOfRecorded = recordedExecutions.length;
    if (numberOfExecutions !== numberOfRecorded) {
        const withoutTestKeys = numberOfExecutions - numberOfRecorded;
        const isPlural = withoutTestKeys > 1;
        testKeyMessage += `\n\n${withoutTestKeys} of ${numberOfExecutions} ${isPlural ? 'are' : 'is'} without test ${
            isPlural ? 'keys' : 'key'
        }.`;
    }

    const text = Object.entries(recordedObj)
        .map(([key, value], index) => `${index + 1}. ${key} ${value}`)
        .join('\n');
    const {id, description, frontend_url} = runDetail;
    return {
        username: process.env.MM_WEBHOOK_USERNAME,
        attachments: [
            {
                color: '#FF9800',
                title: `[${id}: ${description}](${frontend_url})`,
                text:
                    text +
                    testKeyMessage +
                    (withTestExecutionsRecorded
                        ? `\n\nRecorded at [${testCycle}](${process.env.JIRA_TEST_CYCLE_LINK}/${testCycle})`
                        : ''),
            },
        ],
    };
};

const postReportToChannel = async (runDetail, recordedExecutions, executions, testCycle) => {
    const testReport = generateTestReport(runDetail, recordedExecutions, executions, testCycle);
    const response = await fetch(process.env.MM_INCOMING_WEBHOOK, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(testReport),
    });

    const data = await response.text();
    return data;
};

exports.lambdaHandler = async (event) => {
    const {queryStringParameters} = event;
    const body = JSON.parse(event.body);

    if (!body) {
        return {
            statusCode: 400,
            body: JSON.stringify({errorMessage: 'No body found.'}),
        };
    }

    if (!queryStringParameters || !queryStringParameters.cycle) {
        return {
            statusCode: 400,
            body: JSON.stringify({errorMessage: 'No cycle key found.'}),
        };
    }

    try {
        if (body.callback_type === 'after_run') {
            const runId = body.options.run_id;
            const executions = await getRfqaExecutionDetail(runId);
            const recordedExecutions = await saveTestExecutionsToZephyr(queryStringParameters.cycle, executions);
            const runDetail = await getRfqaRunDetail(runId);

            await postReportToChannel(runDetail, recordedExecutions, executions, queryStringParameters.cycle);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({success: true}),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({errorMessage: 'Something went wrong.'}),
        };
    }
};
