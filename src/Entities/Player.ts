import { CONNECTING } from "ws";
import { DBCollectionNames, sendToAnalytics } from "../apicalls";
// import { getDBOptions} from "../server";
import { Card } from "./Card";
import { LogMessage } from "./LoggingHandler";
import { TableGameRoom } from "./TableGameRoom";
import { ConvertTextToBase64, PLAYERSTATE, RemovePlayerEvent, TimeoutKeeper } from "./Utils";
import { Money } from "./Money";



export class Player {

//game specific
    finalTurnTimeout!: NodeJS.Timeout | null;
    lostPoints!: number;
    result: any;
    hasSubmitted:boolean =false;

    hasDeposited: boolean=false;
    private currentDeck:Card[] =[];
    private cardFormation:Card[][] =[];

    savedTime:number = 90;   
    profileImage: any;

 

    assignTokens() {
    }


   
    winAmount: Money = new Money(0);
    resultReason: string = "";

  

    removalEvent: RemovePlayerEvent | null = null;

//common
    plRoomNetId: number = -1;
    gRoom: TableGameRoom | null = null;

    //currentDeckFormation
    // finalCardsFormation : any[] = [];

    score: number = 0;

    //TDL is this even populated?
    balance: Money = new Money(0);

  

    //public playerTokens: Token[] = [];
    public skippedTurns: number = 0;
    isCharged: boolean =false;
    readyForResultCalculation: boolean = false;

    // hasLeft : boolean = false;
    // hasDropped : boolean = false;
    // isWaiting : boolean = false;

    get isBlacklisted(): boolean
    {
        return this.state == PLAYERSTATE.DROPPED || this.state == PLAYERSTATE.WAITING;
    }

    isDisconnected : boolean = false; //is disconnected
    
     state : PLAYERSTATE = PLAYERSTATE.INGAME;

    noOfTurns : number  = 0;
    reward: number = 0;

    lastPickedCard : any = undefined;
    finalTurnTimeoutKeeper!: TimeoutKeeper;

    // private logger : winston.Logger;

    constructor(
        public plSocket: any,
        public tableGameID: string,
        public playerID: string,
        public plName: string,
        public plImage: string

    ) {

        // this.logger = winston.createLogger({
        //     defaultMeta : {service : "GameServer", tableId : this.tableGameID},
        //     format : winston.format.combine(
        //         winston.format.timestamp(),
        //         winston.format.json(),
        //         winston.format.metadata()
        //     ),
        //     transports : [
        //         new winston.transports.MongoDB(getDBOptions(this.playerID)),
        //         new winston.transports.Console({
        //             format : winston.format.combine(
        //                 winston.format.colorize(),
        //                 winston.format.simple()
        //             )
        //         })
        //     ]
        // });


        this.infoLog("Player created");

    }

    sendUpdatedGID()
    {
        if(!this.gRoom)
            return;


        const id = this.gRoom.tableGameId + (this.gRoom.currentGameRoundId.length > 0 ? "_"+this.gRoom.currentGameRoundId : "");

        this.sendMessage({
            t : "gId",
            gId : ConvertTextToBase64(id)
        });
    }

    infoLog(message: string, metadata?: any)
    {
        // this.logger.log({
        //     level: 'info',
        //     message: message,
        //     metadata: metadata
        //     // metadata : {playerID: this.playerID, tableGameID: this.tableGameID, ...metadata}
        // });

        // this.logger.info(message, metadata);
    }

    get playerState(): PLAYERSTATE
    {
        return this.state;
    }

    set playerState(state: PLAYERSTATE)
    {
        if(this.gRoom)
            LogMessage(`Player ${this.plName} state changed to ${PLAYERSTATE[state]}`, this.gRoom, this);

        this.infoLog(`State Changed`, {state: PLAYERSTATE[state]});
        
        this.state = state;
    }

    get cardFormationString(): string[][]
    {
        return this.cardFormation.map(x => x.map(y => y.name));
    }


    addCardToDeck(card:Card, formationIndex:number = -1)
    {
        this.currentDeck.push(card); //Add card to deck

        if(formationIndex == -1)
        {
            this.cardFormation.push([card]);
        } else
        {
            this.cardFormation[formationIndex].push(card);
        }

    }

    checkIfCardExists(card:Card) : boolean
    {
        for(let i = 0; i < this.currentDeck.length; i++)
        {
            if(this.currentDeck[i].name == card.name)
            {
                return true;
            }
        }

        return false;
    }

    removeCardFromDeck(card:Card, removeFromFormation:boolean = false)
    {
        //Find Card index from deck
        const index = this.currentDeck.findIndex(x => x.name == card.name);
       
        if(index != -1)
        {
            this.currentDeck.splice(index, 1); //Remove card from deck
        }


        if(removeFromFormation)
        {
            //Find Card index from formation
            const formationIndex = this.cardFormation.findIndex(x => x.findIndex(y => y.name == card.name) != -1);
            if(formationIndex != -1)
            {
                const cardIndex = this.cardFormation[formationIndex].findIndex(x => x.name == card.name);
                if(cardIndex != -1)
                {
                    this.cardFormation[formationIndex].splice(cardIndex, 1);
                }

                if(this.cardFormation[formationIndex].length == 0)
                {
                    this.cardFormation.splice(formationIndex, 1);
                }
            }
            if(this.gRoom)
                LogMessage(`Formation after removing card ${card.name} : ${JSON.stringify(this.cardFormationString)}`, this.gRoom, this);
        }


    }

    updateDeckFormation(formation : any)
    {

        this.cardFormation = [];

        let cardsCount = 0;
        for(let i = 0; i < formation.length; i++)
        {

            if(formation[i].length == 0)
                continue;

            const cards:Card[] = [];

            if(Array.isArray(formation[i]))
            {
                for(let j = 0; j < formation[i].length; j++)
                {
                    cards.push(Card.convertToCard(formation[i][j]));
                    cardsCount++;
                }
            } else
            {
                cards.push(Card.convertToCard(formation[i]));
                cardsCount++;
            }

            this.cardFormation.push(cards);
        }

        // this.cardFormation = formation.map(x => x.map(y => Card.convertToCard(y)));

        if(cardsCount != this.currentDeck.length)
        {
            if(this.gRoom)
                LogMessage(`Error in deck formation. Deck length : ${this.currentDeck.length} , Formation length : ${cardsCount}`, this.gRoom, this);
        }

        if(this.gRoom)
            LogMessage(`Player ${this.plName} deck formation updated, CardFormation : ${JSON.stringify(this.cardFormation)}`, this.gRoom, this);
    }

    // remove()
    // {
    // }

    reset()
    {
        this.state = PLAYERSTATE.WAITING;
        this.skippedTurns = 0;
        this.score = 0;
        this.balance = new Money(0);
        this.noOfTurns = 0;
        this.reward = 0;
        this.lastPickedCard = undefined;
        this.isCharged = false;
        this.cardFormation = [];
        // this.finalCardsFormation = [];
        this.currentDeck = [];
        this.hasSubmitted = false;
        this.readyForResultCalculation = false; 
        this.winAmount = new Money(0);
     
    }


    restartReset()
    {
        this.cardFormation = [];
        this.currentDeck = [];
    }


    //id of game session player is inside

    sendMessage(content: any, isBinary: boolean = false) {

        // if (content.t == "timer" || content.t == "turnTimer") {

        // } else {
        //     //  console.log("Sending to "+ this.plName +"----");
        //     //  console.log(content);
        // }
        if (this.plSocket && this.plSocket.isConnectionAlive) {
            if (isBinary)
                this.plSocket.send(content);
            else {

                try
                {
                    this.plSocket.send(JSON.stringify(content));

                } catch
                {

                    // console.log("Error in sending message to player");
                    console.log(content);

                    sendToAnalytics({
                        collection : DBCollectionNames.UnexpectedErrors,
                        data : {
                            type : "SOCKET_NULL",
                            msg : "Error in sending message to player",
                            playerId : this.playerID,
                            tableGameId : this.tableGameID,
                            content : content,
                        }
                    });
                    // throw new Error("Error in sending message to player");
                }
            }
        }
    }


    public updateRemovalEvent(event: RemovePlayerEvent): boolean {

        if (this.removalEvent == RemovePlayerEvent.TIMEOUT)
            return false;


        this.removalEvent = event;
        return true;
    }
}

export { PLAYERSTATE };
