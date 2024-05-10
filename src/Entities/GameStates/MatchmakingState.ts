import { CallLeftPlayerAPI } from "../../apicalls";
import { ErrorRequest, KickRequest, LeaveState } from "../../DataTypes";
import { LogMessage } from "../LoggingHandler";
import { Player } from "../Player";
import { TableGameRoom } from "../TableGameRoom";
import { ErrorCode, GAMESTATE, MSGTYPE, PLAYERSTATE, RemovePlayerEvent } from "../Utils";
import { GameState } from "./GameState";


export class MatchmakingState extends GameState
{ 

    constructor(table : TableGameRoom)
    {
        super(table, GAMESTATE.MATCHMAKING);
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
        this.table.currentPlayersCount--;

        //call player left API
        CallLeftPlayerAPI(this.table.tableGameId, player.playerID, RemovePlayerEvent.PRELEFT);

    }

    public override async Kick(player: Player, kickReq: KickRequest): Promise<void> {
        super.Kick(player, kickReq);
        // throw new Error("Method not implemented.");
    }

    public override async Errored(player: Player, errorData: ErrorRequest): Promise<void> {
        super.Errored(player, errorData);

        player.playerState = PLAYERSTATE.LEFT;

        this.UnableToJoinError(player, errorData);
    }
}