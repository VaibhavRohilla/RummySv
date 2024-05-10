"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveRequestQueue = exports.RemoveRequest = void 0;
const apicalls_1 = require("../apicalls");
const DataTypes_1 = require("../DataTypes");
const LoggingHandler_1 = require("./LoggingHandler");
class RemoveRequest {
    constructor(pl, leaveState, data = undefined) {
        this.player = pl;
        this.leaveState = leaveState;
        this.data = data;
    }
}
exports.RemoveRequest = RemoveRequest;
//static remove requests queue 
class RemoveRequestQueue {
    constructor(table) {
        this.table = table;
        this._maxQueueSize = 8;
        this._queue = new Array(this._maxQueueSize);
        this._head = 0;
        this._tail = 0;
        this.isReqProcessing = false;
    }
    get queueSize() {
        //get queue size
        return (this._tail - this._head + this._maxQueueSize) % this._maxQueueSize;
    }
    AddRequest(request) {
        //check for duplicate requests
        for (let i = 0; i < this._queue.length; i++) {
            const req = this._queue[i];
            if (req == undefined)
                continue;
            if (req.player.playerID == request.player.playerID) {
                (0, LoggingHandler_1.LogMessage)("Duplicate remove request for player " + request.player.playerID, this.table, request.player);
                (0, apicalls_1.sendToAnalytics)({
                    collection: apicalls_1.DBCollectionNames.UnexpectedErrors,
                    data: {
                        error: "DuplicateRemoveRequest",
                        tableId: this.table.tableGameId,
                        playerId: request.player.playerID,
                        leaveState: request.leaveState,
                        gameRoundId: this.table.currentGameRoundId,
                        time: new Date()
                    }
                });
                //duplicate request
                return;
            }
        }
        if ((this._tail + 1) % this._maxQueueSize == this._head) {
            // queue is full
            (0, LoggingHandler_1.LogMessage)("Remove request queue is full", this.table, request.player);
            // for(let i = this._head; i < this._tail; i++)
            // {
            //     LogMessage("Queue item " + i + " : " + this._queue[i].player.playerID + " > " + JSON.stringify(this._queue[i].data) + " : " + this._queue[i].leaveState, this.table, request.player);
            // }
            // throw new Error("Queue is full");
        }
        this._queue[this._tail] = request;
        this._tail = (this._tail + 1) % this._maxQueueSize;
        (0, LoggingHandler_1.LogMessage)("Added request to queue", this.table, request.player);
        (0, LoggingHandler_1.LogMessage)(JSON.stringify({
            playerId: request.player.playerID,
            leaveState: request.leaveState,
            data: request.data
        }), this.table, request.player);
        (0, LoggingHandler_1.LogMessage)("Queue size : " + this.queueSize, this.table, request.player);
        //process request if queue is not empty
        if (this._head != this._tail) {
            this.ProcessRequest();
        }
    }
    ProcessRequest() {
        if (this.isReqProcessing)
            return;
        if (this._head == this._tail) {
            // queue is empty
            return;
        }
        this.isReqProcessing = true;
        let request = this._queue[this._head];
        if (request != undefined)
            this.ProcessRequestAsync(request);
        this._queue[this._head] = undefined;
        this._head = (this._head + 1) % this._maxQueueSize;
        // this.ProcessRequest();
    }
    ProcessRequestAsync(request) {
        return __awaiter(this, void 0, void 0, function* () {
            (0, LoggingHandler_1.LogMessage)("Processing request", this.table, request.player);
            //remove player from table
            if (request.leaveState == DataTypes_1.LeaveState.ERROR)
                yield this.table.gameStateHandler.OnError(request.player, request.data);
            else if (request.leaveState == DataTypes_1.LeaveState.KICKED)
                yield this.table.gameStateHandler.OnKickPlayer(request.player, request.data);
            else
                yield this.table.gameStateHandler.OnPlayerLeave(request.player, request.leaveState);
            this.OnRequestProcessed();
        });
    }
    OnRequestProcessed() {
        this.table.performPlayerCountChecks();
        this.isReqProcessing = false;
        this.ProcessRequest();
    }
}
exports.RemoveRequestQueue = RemoveRequestQueue;
//# sourceMappingURL=RemoveRequest.js.map