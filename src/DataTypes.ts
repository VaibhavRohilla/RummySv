import { ErrorCode, RemovePlayerEvent } from "./Entities/Utils"



export interface GameEndReportAPIResponse
{
    [id : string] : boolean
}

export enum LeaveState
{
    WS_DISCONNECT,
    LEAVE_CLICKED,
    KICKED,
    ERROR
}




export interface ErrorRequest
{
    msg : string,
    code : ErrorCode 
}

export interface KickRequest
{
   removeEvent : RemovePlayerEvent,
   callBack : (() => void) | undefined  
}

export interface APIResponse<T>
{
    meta : {
        error : boolean,
        rcv : boolean,
        status : string,
        statusCode : number | string,
        message : string,
        recordTotal : number
    },
    data : T
}

export interface RemoveForSwitchResponseData
{
    playerId : number,
    tableGameId : number
}

export interface TXUpdatedResponseType
{
    balance : number,
    rake : number,
}