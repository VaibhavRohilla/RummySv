import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest, LeaveState } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";



export abstract class GameState
{
    protected table : TableGameRoom;

    constructor(table : TableGameRoom, id : GAMESTATE)
    {
        this.table = table;
        this.id = id;
        // this.table.gameState = this;        
    }

    public abstract OnStateEnter() : void;

    public abstract OnStateExit() : void;

    public abstract OnPlayerJoin(player : Player) : void;

    private id : GAMESTATE;

    public get ID() : GAMESTATE { return this.id; }

    public async OnPlayerLeave(player : Player, leaveState : LeaveState) : Promise<void>
    {
        if(player.playerState == PLAYERSTATE.LEFT)
        {
            //if player is already left then return as we have already handled this
            LogMessage("Player is already left, returning from OnPlayerLeave method", this.table, player);
            return;
        }

        if(leaveState == LeaveState.LEAVE_CLICKED)
        {
            await this.OnLeaveClicked(player);
        } else if(leaveState == LeaveState.WS_DISCONNECT)
        {
            //if player is already disconnected then dont do anything as it's already handled
            if(!player.isDisconnected)
                await this.OnWsDisconnect(player);
            else
                LogMessage("Player is already disconnected, returning from OnPlayerLeave method", this.table, player);
        }
    }

    public async OnLeaveClicked(player : Player) : Promise<void>
    {
        LogMessage("Player " + player.playerID + " left the game", this.table, player);
    }
    public async OnWsDisconnect(player : Player) : Promise<void>
    {
        LogMessage("Player " + player.playerID + " disconnected from table " + this.table.tableGameId, this.table, player);
    }

    public async Errored(player : Player, errorData : ErrorRequest) : Promise<void>
    {
        LogMessage("Error in player " + player.playerID + " : " + errorData.code + " : " + errorData.msg, this.table, player);
    }

    public async Kick(player : Player, kickReq : KickRequest) : Promise<void>
    {
        LogMessage("Kicked player " + player.playerID + " : " + kickReq.removeEvent, this.table, player); 
    }

    protected UnableToJoinError(player : Player, errorData : ErrorRequest)
    {
        errorData.msg += ` Error Code: ${errorData.code}`;

        player.sendMessage({
            t : MSGTYPE.ERROR,
            msg : errorData.msg,
        });

        player.infoLog("UnableToJoin", errorData);

        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.ERRORED);

        this.CloseSocket(player);
    }

    protected BasicLeftOperations(player : Player) : void
    {
        player.playerState = PLAYERSTATE.LEFT;

        this.table.sendMessageToAll({
            t : MSGTYPE.PLEFT,
            data : player.plRoomNetId,
            state : player.playerState
        });

        delete this.table.PlayersUniqIdDict[player.plRoomNetId];
        this.table.currentPlayersCount--;
        //TODO : can set gRoom of player to null here as this is the last place where we use it
        LogMessage(`Player ${player.playerID} deleted from the game`, this.table, player);
    }


    protected CloseSocket(player : Player) : void
    {
        if(player.plSocket && player.plSocket.isConnectionAlive)
        {
            player.plSocket.close();
        }
    }


}

import { FinishingState } from "./FinishingState";
import { InGameState } from "./InGameState";
import { MatchmakingState } from "./MatchmakingState";
import { RestartingState } from "./RestartingState";
import { ResultState } from "./ResultState";
import { SubmitingState } from "./SubmitingState";
import { TossState } from "./TossState";

export class GameStateHandler
{
    private table : TableGameRoom;
    private currentState : GameState;

    constructor(table : TableGameRoom)
    {
        this.table = table;
        this.currentState = new MatchmakingState(table);
        // this.currentState.OnStateEnter();
    }

    public OnPlayerJoin(player : Player)
    {
        this.currentState.OnPlayerJoin(player);
    }

    public async OnPlayerLeave(player : Player, leaveState : LeaveState)
    {
        await this.currentState.OnPlayerLeave(player, leaveState);
    }

    public async OnKickPlayer(player : Player, kickReq : KickRequest)
    {
        await this.currentState.Kick(player, kickReq);
    }

    public async OnError(player : Player, errorData : ErrorRequest)
    {
        await this.currentState.Errored(player, errorData);
    }

    public OnStateEnter()
    {
        this.currentState.OnStateEnter();
    }

    public OnStateExit()
    {
        this.currentState.OnStateExit();
    }

    public SetState(state : GAMESTATE)
    {
        // if(this.currentState)
        //     this.currentState.OnStateExit();

        switch(state)
        {
            case GAMESTATE.MATCHMAKING:
                this.currentState = new MatchmakingState(this.table);
                break;
            case GAMESTATE.TOSS:
                this.currentState = new TossState(this.table);
                break;
            case GAMESTATE.INGAME:
                this.currentState = new InGameState(this.table);
                break;
            case GAMESTATE.FINISHING:
                this.currentState = new FinishingState(this.table);
                break;
            case GAMESTATE.SUBMITING:
                this.currentState = new SubmitingState(this.table);
                break;
            case GAMESTATE.RESULT:
                this.currentState = new ResultState(this.table);
                break;
            case GAMESTATE.RESTARTING:
                this.currentState = new RestartingState(this.table);
                break;
        }

        LogMessage("Game State Changed to " + GAMESTATE[this.GetState], this.table);

        // this.OnStateEnter();
    }

    public get GetState() : GAMESTATE 
    {
        return this.currentState.ID;
    }


}