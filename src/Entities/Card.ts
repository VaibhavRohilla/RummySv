export class Card {

    constructor(public val: number, public suit: SUIT) {

        // if (val > 10) {
        //     this.isFaceCard = true
        // }
       this.name= val+"-"+suit
      // console.log(this.name)
    }

    name:string
 
    // isFaceCard!: boolean
    // isJoker!: boolean

    static convertToCard(cardName:string) : Card
    {
        const cardData = cardName.split("-");

        return new Card(parseInt(cardData[0]), parseInt(cardData[1]) as SUIT);
    }
}


export enum SUIT {
    JOKER,
    S,
    C,
    H,
    D,
}

