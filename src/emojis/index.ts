import alienMonster           from './Alien Monster.png';
import alien                  from './Alien.png';
import beamingFace            from './Beaming Face with Smiling Eyes.png';
import confusedFace           from './Confused Face.png';
import cowboyHatFace          from './Cowboy Hat Face.png';
import disguisedFace          from './Disguised Face.png';
import droolingFace           from './Drooling Face.png';
import explodingHead          from './Exploding Head.png';
import faceBlowingKiss        from './Face Blowing a Kiss.png';
import faceExhaling           from './Face Exhaling.png';
import faceWithMonocle        from './Face with Monocle.png';
import faceWithRaisedEyebrow  from './Face with Raised Eyebrow.png';
import ghost                  from './Ghost.png';
import goblin                 from './Goblin.png';
import grinningCat            from './Grinning Cat.png';
import grinningFaceBigEyes    from './Grinning Face with Big Eyes.png';
import hearNoEvilMonkey       from './Hear-No-Evil Monkey.png';
import heartOnFire            from './Heart on Fire.png';
import kissingFaceClosedEyes  from './Kissing Face with Closed Eyes.png';
import loveLetter             from './Love Letter.png';
import mendingHeart           from './Mending Heart.png';
import moneyMouthFace         from './Money-Mouth Face.png';
import nerdFace               from './Nerd Face.png';
import ogre                   from './Ogre.png';
import partyingFace           from './Partying Face.png';
import pileOfPoo              from './Pile of Poo.png';
import robot                  from './Robot.png';
import salutingFace           from './Saluting Face.png';
import skull                  from './Skull.png';
import smilingFaceHalo        from './Smiling Face with Halo.png';
import smilingFaceHorns       from './Smiling Face with Horns.png';
import smirkingFace           from './Smirking Face.png';
import thinkingFace           from './Thinking Face.png';

/** Map from Unicode emoji character → bundled data URL. */
export const EMOJI_ASSETS: Record<string, string> = {
	'👾': alienMonster,
	'👽': alien,
	'😁': beamingFace,
	'😕': confusedFace,
	'🤠': cowboyHatFace,
	'🥸': disguisedFace,
	'🤤': droolingFace,
	'🤯': explodingHead,
	'😘': faceBlowingKiss,
	'😮‍💨': faceExhaling,
	'🧐': faceWithMonocle,
	'🤨': faceWithRaisedEyebrow,
	'👻': ghost,
	'👺': goblin,
	'😺': grinningCat,
	'😃': grinningFaceBigEyes,
	'🙉': hearNoEvilMonkey,
	'❤️‍🔥': heartOnFire,
	'😚': kissingFaceClosedEyes,
	'💌': loveLetter,
	'❤️‍🩹': mendingHeart,
	'🤑': moneyMouthFace,
	'🤓': nerdFace,
	'👹': ogre,
	'🥳': partyingFace,
	'💩': pileOfPoo,
	'🤖': robot,
	'🫡': salutingFace,
	'💀': skull,
	'😇': smilingFaceHalo,
	'😈': smilingFaceHorns,
	'😏': smirkingFace,
	'🤔': thinkingFace,
};

/** Ordered list of all available emoji characters (matches the curated picker). */
export const CURATED_EMOJIS: string[] = Object.keys(EMOJI_ASSETS);

// Named exports for mascot state images
export { thinkingFace as THINKING_PNG, heartOnFire as INLOVE_PNG, partyingFace as PARTY_PNG };
