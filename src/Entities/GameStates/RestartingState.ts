import { CallLeftPlayerAPI, DBCollectionNames, sendToAnalytics } from "../../apicalls";
import { ErrorRequest, KickRequest, LeaveState } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";


export class RestartingState extends GameState
{ 

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.RESTARTING);
    }


    public OnStateEnter(): void {
        // throw new Error("Method not implemented.");
    }
    public OnStateExit(): void {
        // throw new Error("Method not implemented.");
    }
    public OnPlayerJoin(player: Player): void {
        // throw new Error("Method not implemented.");
    }

    public override async OnLeaveClicked(player: Player): Promise<void> {
        super.OnLeaveClicked(player);
        this.OnWsDisconnect(player); 
        this.CloseSocket(player);
    }

    public override async OnWsDisconnect(player: Player): Promise<void> {
        super.OnWsDisconnect(player);
        //Set player state to Left
        player.playerState = PLAYERSTATE.LEFT;
        //send message to other players that player has left
        this.table.sendMessageToAll({
            t : MSGTYPE.PLEFT,
            data : player.plRoomNetId,
            state : player.playerState
        });


        //Delete player from PlayersUniqIdDict in TableGameRoom
        delete this.table.PlayersUniqIdDict[player.plRoomNetId];
        //Decrease player count in TableGameRoom
        console.log('RestartingState : Decreasing player count in TableGameRoom : '+this.table.currentPlayersCount)
        this.table.currentPlayersCount--;

        //call player left API
        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.PRELEFT);

    }

    public override async Kick(player: Player, kickReq: KickRequest): Promise<void> {
        super.Kick(player, kickReq);

        sendToAnalytics({
            collection : DBCollectionNames.UnexpectedErrors,
            data : {
                error : "KickInRestartingState",
                tableId : this.table.tableGameId,
                playerId : player.playerID,
                kickReq : kickReq,
                state : player.playerState,
                gameRoundId : this.table.currentGameRoundId,
            }
        });

        // if(player.isDisconnected)
        {
            this.BasicLeftOperations(player);
            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.KICKED);
            this.CloseSocket(player);
        }
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void> {
        super.Errored(player, errorData);

        player.playerState = PLAYERSTATE.LEFT;

        if(errorData.code == ErrorCode.INSUFFICIENT_BALANCE)
        {
            player.sendMessage({
                t : MSGTYPE.ERROR,
                msg : errorData.msg
            });

            this.BasicLeftOperations(player);

            CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.ERRORED);
        } else
            this.UnableToJoinError(player, errorData);
    }
}