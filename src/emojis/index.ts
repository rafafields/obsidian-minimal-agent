import alienMonster           from './Alien Monster.webp';
import alien                  from './Alien.webp';
import beamingFace            from './Beaming Face with Smiling Eyes.webp';
import confusedFace           from './Confused Face.webp';
import cowboyHatFace          from './Cowboy Hat Face.webp';
import disguisedFace          from './Disguised Face.webp';
import droolingFace           from './Drooling Face.webp';
import explodingHead          from './Exploding Head.webp';
import faceBlowingKiss        from './Face Blowing a Kiss.webp';
import faceExhaling           from './Face Exhaling.webp';
import faceWithMonocle        from './Face with Monocle.webp';
import faceWithRaisedEyebrow  from './Face with Raised Eyebrow.webp';
import ghost                  from './Ghost.webp';
import goblin                 from './Goblin.webp';
import grinningCat            from './Grinning Cat.webp';
import grinningFaceBigEyes    from './Grinning Face with Big Eyes.webp';
import hearNoEvilMonkey       from './Hear-No-Evil Monkey.webp';
import heartOnFire            from './Heart on Fire.webp';
import kissingFaceClosedEyes  from './Kissing Face with Closed Eyes.webp';
import loveLetter             from './Love Letter.webp';
import mendingHeart           from './Mending Heart.webp';
import moneyMouthFace         from './Money-Mouth Face.webp';
import nerdFace               from './Nerd Face.webp';
import ogre                   from './Ogre.webp';
import partyingFace           from './Partying Face.webp';
import pileOfPoo              from './Pile of Poo.webp';
import robot                  from './Robot.webp';
import salutingFace           from './Saluting Face.webp';
import skull                  from './Skull.webp';
import smilingFaceHalo        from './Smiling Face with Halo.webp';
import smilingFaceHorns       from './Smiling Face with Horns.webp';
import smirkingFace           from './Smirking Face.webp';
import thinkingFace           from './Thinking Face.webp';

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
