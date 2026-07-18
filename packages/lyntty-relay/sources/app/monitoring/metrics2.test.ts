import { beforeEach, describe, expect, it, mock } from "bun:test";

const dbMock = {
    account: { count: mock() },
    session: { count: mock() },
    sessionMessage: { count: mock() },
    machine: { count: mock() },
    $queryRaw: mock()
};

mock.module("@/storage/db", () => ({
    db: dbMock
}));

import { updateDatabaseMetrics } from "./metrics2";

describe("updateDatabaseMetrics", () => {
    beforeEach(() => {
        mock.clearAllMocks();
        dbMock.account.count.mockResolvedValue(10);
        dbMock.session.count.mockResolvedValue(20);
        dbMock.sessionMessage.count.mockResolvedValue(30);
        dbMock.machine.count.mockResolvedValue(40);
        dbMock.$queryRaw.mockResolvedValue([{ estimated_count: 123n }]);
    });

    it("uses estimated counts instead of exact table counts", async () => {
        await updateDatabaseMetrics();

        expect(dbMock.account.count).not.toHaveBeenCalled();
        expect(dbMock.session.count).not.toHaveBeenCalled();
        expect(dbMock.sessionMessage.count).not.toHaveBeenCalled();
        expect(dbMock.machine.count).not.toHaveBeenCalled();
        expect(dbMock.$queryRaw).toHaveBeenCalledTimes(4);

        const queriedTables = dbMock.$queryRaw.mock.calls.map((call) => call[1]);
        expect(queriedTables).toEqual(['"Account"', '"Session"', '"SessionMessage"', '"Machine"']);
    });
});
