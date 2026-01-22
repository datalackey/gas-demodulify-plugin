/** @type {import('jest').Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/test/**/*.test.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    roots: ["<rootDir>"],
    setupFilesAfterEnv: ["<rootDir>/scripts/jest.guard.dist-freshness.ts"],
};
