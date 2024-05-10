import { DBCollectionNames, sendToAnalytics } from "../apicalls";
import { TableGameRoom } from "./TableGameRoom";
import { ErrorCode } from "./Utils";


export enum FunctionLogNames{
    ON_PLAYER_WS_DISCONNECT = "playerLeftRemoveFromGame",
    ON_PLAYER_CHANGE_TABLE = "handleSwitchTable"
}

export enum LogGameStates {
    GAME_STARTED = "GAME STARTED",
    MONEY_DEDUCTED = "MONEY DEDUCTED",
    RESULT_CALCULATED = "RESULT CALCULATED",
    MONEY_CREDITED = "MONEY CREDITED",
    GAME_END = "GAME ENDED"
}

export interface logDataType
{
    functionName: string,
    reason: string,
    properties: any,
    time: Date,
    servId: string | undefined
    errorCode : ErrorCode
}


export function LogGameStateToDB(state : LogGameStates, table : TableGameRoom, data : any = undefined)
{
    try
    {
        const currentPlayers : string[] = [];

        
        for(let id in table.PlayersUniqIdDict)
        {
            if(table.PlayersUniqIdDict[id])
            {
                currentPlayers.push(table.PlayersUniqIdDict[id].playerID);
            }
        }


        sendToAnalytics({collection: DBCollectionNames.GAME_STATES_LOGS, data: {
            state : state,
            tableGameID : table.tableGameId,
            players : currentPlayers,
            data : data,
            time : new Date(),
            session : table.currentGameRoundId,
            servID : process.env.SERVERID,
        }});
    }
    catch(error)
    {
        sendToAnalytics({
            collection: DBCollectionNames.LOGGING_FAILED, data: {
                state : state,
                time : new Date(),
                tableGameID : table.tableGameId,
                session : table.currentGameRoundId,
                servID : process.env.SERVERID,
            }});
    }
}

export function LogBalanceDeductFail(event : string, playerID : string, tableGameID : string, gameSession : string, amount : number)
{
        sendToAnalytics({collection : DBCollectionNames.UnexpectedErrors, data : {
            event : event, 
            playerID : playerID,
            tableGameID : tableGameID,
            session : gameSession,
            time : new Date(),
            servID : process.env.SERVERID
        }});
}

export function LogErrorToDB(data : logDataType)
{

    try
    {
        sendToAnalytics({collection: DBCollectionNames.ERROR_IN_GAMESERVER, data: data});
    }
    catch(error)
    {
        sendToAnalytics({
            collection: DBCollectionNames.LOGGING_FAILED, data: {
                functionName : data.functionName, 
                ERROR : error,
                time : new Date(),
                ErrorCode : data.errorCode,
                serverID : data.servId
            }});
    }

}