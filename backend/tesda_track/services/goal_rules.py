"""Plain-language rules around the matcher, in the order a counselor would apply them (stdlib only).

1. Negation: what the learner says they do NOT want is dropped before matching ("ayoko magluto, gusto ko mag-ayos
   ng aircon" is about aircon).
2. Trade evidence: a few everyday words (training, work, home ...) never count as a trade on their own.
3. No match: a question about fees, schedules or centres, a goal that names no trade at all ("any work"), and a
   career that needs a degree rather than a TESDA qualification get no match, whatever the model thinks.
4. Level order: inside one family (Welding NC I/II/III) the level the learner needs goes first.

Nothing here stores or logs the learner's text.
"""
import re

from tesda_track.schemas.analysis import Match, MatchComponents
from tesda_track.utils.helpers import _edit_distance, normalize

# --- 1. negation ------------------------------------------------------------------------------------------------

# Where a negated clause stops: punctuation, a contrast word, or the start of what the learner does want.
_CLAUSE_END = (r"(?=[,;.!?\n]|\s+(?:pero|ngunit|kundi|kaya|but|instead|rather|so|and\s+(?:i|ako)\b|"
               r"gusto\s+(?:ko|kong|ko\s+ng)|mas\s+gusto|i\s+want|i'd\s+rather|i\s+would\s+rather|i\s+like|"
               r"sa\s+halip|mas\s+okay|ang\s+gusto|nais\s+ko)\b|$)")
_NEGATORS = (r"ayoko|ayaw\s+ko|ayaw\s+na\s+ko|ayokong|ayoko\s+nang|ayoko\s+na|hindi\s+ko\s+gusto|di\s+ko\s+gusto|"
             r"hindi\s+ako\s+interesado|di\s+ako\s+interesado|wala\s+akong\s+hilig|"
             r"i\s+don't\s+want|i\s+do\s+not\s+want|i\s+dont\s+want|i\s+hate|i\s+dislike|i\s+don't\s+like|"
             r"i\s+do\s+not\s+like|i\s+can't\s+stand|i'm\s+not\s+interested\s+in|i\s+am\s+not\s+interested\s+in|"
             r"not\s+interested\s+in|no\s+more|i\s+never\s+want|i\s+won't\s+do")
_NEGATED = re.compile(rf"\b(?:{_NEGATORS})\b.*?{_CLAUSE_END}", re.IGNORECASE)


def strip_negated(text: str) -> str:
    """The text without the clauses that say what the learner does not want."""
    return re.sub(r"\s+", " ", _NEGATED.sub(" ", text)).strip(" ,;.")


# --- 2. words that are not a trade ------------------------------------------------------------------------------

# Corpus words of the catalog's own text (Trainers Methodology, Web Development ...) that say nothing about a trade
# when a learner uses them: they never count as keyword evidence on their own.
GENERIC_WORDS = frozenset("""
    training trainings trainer center centre centers centres tesda website site web app apps school schools course
    courses job jobs work works working worker trabaho trabaho hanapbuhay pagawaan home bahay house family pamilya
    support suporta stable stabil secure steady good better high pay salary sweldo sahod money pera income kita
    opportunity opportunities oportunidad future kinabukasan career karera business negosyo skill skills kasanayan
    something anything kahit ano ano kahit pwede puwede maaari magsimula simula start starting agad immediately soon
    anywhere abroad
    """.split())

# Function words and text-speak fillers in English and Tagalog: part of a sentence, never a trade.
FILLER_WORDS = frozenset("""
    a an the i me my mine we our us you your he she it they them their his her is am are was were be been being do does
    did have has had will would can could should may might must shall to of in on at by for from with without about as
    into and or but so if then than that this these those there here just only also too very really now not no yes any
    some all more most much many want wants wanted wish need needs like love get got going go become becoming looking
    look find finding take make
    ko ako akin ang ng sa na at o ay mga si ni kay ito iyan iyon yan yun po opo ba din rin lang lamang naman pa pang
    para kung kapag pag kasi dahil pero kaya sana gusto gustong nais pangarap hanap hinahanap kailangan kelangan
    pwede puwede maging mag mging mgng akong kong ka ikaw siya kami tayo kayo sila amin atin namin natin ninyo nila
    isang ilang sobra talaga muna ulit uli bago lahat wala meron mayroon may iba ibang yung ung mo ba
    gsto gsto q ku mging mgnda pls plss please help tulong
    """.split())

# Careers that need a degree, a licence or a stage rather than a TESDA qualification; with no trade named alongside
# them there is nothing to match. (Careers a counselor does bridge to a TESDA course, such as nurse or teacher,
# are not listed.)
NO_TVET_CAREERS = frozenset("""
    lawyer lawyers attorney abogado abogada abogdo judge huwes hukom prosecutor doctor doctors doktor surgeon surgeons
    physician medisina medicine politician pulitiko senator senador congressman mayor governor gobernador president
    pangulo astronaut scientist siyentipiko professor actor actress artista celebrity superstar gamer gamers esports
    streamer streamers influencer nbi fbi cia detective spy
    """.split())

_WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)?")


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower().replace("-", " "))


# Single-word keywords that name a place, a thing or a verb every trade uses, not a trade (alaga/take care of is
# also what a farmer does with animals; barko/ship is also where a cook or an electrician works).
HIJACK_KEYWORDS = frozenset("""
    barko alaga mag-alaga kuryente bukid kotse sasakyan kompyuter computer wiring bahay bubong pintura magtanim
    """.split())


def is_hijack(keyword: str) -> bool:
    return keyword in HIJACK_KEYWORDS


def is_generic(keyword: str) -> bool:
    """A single-word keyword that is only an everyday word, so it is no evidence of a trade."""
    return keyword in GENERIC_WORDS


_GENERIC_BY_LENGTH: dict[int, list[str]] = {}
for _word in GENERIC_WORDS:
    _GENERIC_BY_LENGTH.setdefault(len(_word), []).append(_word)


def _near_generic(word: str) -> bool:
    """Within one edit of an everyday word of 5+ letters (stabel for stable)."""
    return len(word) >= 5 and any(_edit_distance(word, w) <= 1
                                  for n in (len(word) - 1, len(word), len(word) + 1)
                                  for w in _GENERIC_BY_LENGTH.get(n, ()) if n >= 5)


def names_no_trade(text: str) -> bool:
    """True when nothing in `text` can be a trade: every word is a function word, a filler or an everyday word."""
    for word in _words(text):
        if word in FILLER_WORDS or word in GENERIC_WORDS or len(word) < 2:
            continue
        if _near_generic(word):  # a typo of an everyday word (stabel job)
            continue
        return False
    return True


# --- 3. no match -------------------------------------------------------------------------------------------------

ADMIN_WORDS = frozenset("""
    tesda training trainings center centre centers centres website site app portal account login password enroll
    enrol enrolment enrollment register registration requirements requirement scholarship scholarships iskolarship
    tuition fee fees bayad presyo schedule iskedyul voucher allowance address contact hotline email assessment
    application apply mag-enroll pumasok tanggapan
    """.split())
_QUESTION = re.compile(
    r"\?|\b(?:magkano|kailan|saan|sino|ilan|ilang|gaano|paano|bakit|ano|ano'ng|anong|ba|how|what|where|when|who|which|"
    r"why|can i|can we|do you|is there|are there|may|meron|mayroon|libre|free|hindi\s+gumagana|di\s+gumagana|"
    r"not\s+working|doesn't\s+work|nearest|pinakamalapit|malapit)\b")
_QUESTION_WORDS_EN = re.compile(r"\b(?:how|what|where|when|who|which|why|nearest|free)\b")


def is_admin_question(text: str) -> bool:
    """A question or complaint about fees, schedules, centres or the website, not about a trade."""
    text = normalize(text)
    words = set(_words(text))
    return bool(words & ADMIN_WORDS) and _QUESTION.search(text) is not None


def names_no_tvet_career(text: str) -> bool:
    return bool(set(_words(text)) & NO_TVET_CAREERS)


def gives_no_match(query: str, has_trade_evidence: bool) -> bool:
    """True when the learner's words cannot be a request for a TESDA qualification, so no match is shown however
    similar the catalog text looks. A trade keyword in the goal always lets it through."""
    if has_trade_evidence:
        return False
    text = strip_negated(query)
    return names_no_trade(text) or is_admin_question(text) or names_no_tvet_career(text)


# --- 4. level order ----------------------------------------------------------------------------------------------

_LEVEL_TOKEN = re.compile(r"\b(?:nc|level)\s*(iv|iii|ii|i)\b", re.IGNORECASE)
_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4}
_MENTION = re.compile(r"\bnc[\s-]*(iv|iii|ii|i|4|3|2|1)\b")
_ARABIC = {"1": 1, "2": 2, "3": 3, "4": 4}
_SEGMENT_START = re.compile(r"[,;.!?]|\bpero\b|\bbut\b|\bat ngayon\b|\bnow\b|\bngayon\b|\band\b")
_HELD_BEFORE = re.compile(r"\b(?:may|mayroon|meron|have|has|hold|holder|already|nakakuha|nakapasa|kuha\s+na|passed|"
                          r"graduate|na-|nag-|certified)\b|\bnag-$|\bna-$")
_HELD_AFTER = re.compile(r"^\s*(?:na\b|holder|certificate|ko\s+na)")
_WANTED_BEFORE = re.compile(r"\b(?:gusto|nais|want|wish|kumuha|kuha|mag-take|take|aim|goal|target|get|upgrade|"
                            r"mag-apply|apply|proceed|next|susunod|ma-?ka|makakuha|makuha|kailangan|need)\b")
NEXT_LEVEL = re.compile(r"\b(?:susunod\s+na\s+level|next\s+level|higher\s+level|level\s+up|upgrade|mas\s+mataas\s+na|"
                        r"advance(?:d)?\s+level|susunod\s+na\s+nc)\b")
BEGINNER = re.compile(r"\b(?:baguhan|beginner|newbie|walang\s+karanasan|wala\s+pang\s+(?:karanasan|experience|nc|alam)|"
                      r"wala\s+akong\s+(?:karanasan|experience)|wala\s+pa\s+akong\s+(?:karanasan|experience|alam)|"
                      r"no\s+experience|just\s+starting|starting\s+out|kakasimula|simula\s+pa\s+lang|"
                      r"first\s+time|unang\s+beses|gusto\s+(?:ko\s+)?(?:pang\s+)?matuto|matuto\s+pa\s+lang)\b")
SUPERVISORY = re.compile(r"\b(?:foreman|supervisor|supervise|mag-supervise|mamahala|manager|team\s+leader|head|"
                         r"lead|pamunuan|mamuno|namamahala)\b")


def level_of(name: str) -> tuple[str, int] | None:
    """('Welding', 2) for 'Welding NC II': the family (name without its level) and the level."""
    found = _LEVEL_TOKEN.search(name)
    if not found:
        return None
    family = re.sub(r"\s+", " ", name[:found.start()] + name[found.end():]).strip()
    return family, _ROMAN[found.group(1).lower()]


def _mentions(text: str) -> list[tuple[int, str]]:
    """(level, how it is used) for each 'NC II' in the goal: held, wanted or plain."""
    found = []
    previous_end = 0
    for m in _MENTION.finditer(text):
        level = _ROMAN.get(m.group(1)) or _ARABIC[m.group(1)]
        start = previous_end
        for boundary in _SEGMENT_START.finditer(text, previous_end, m.start()):
            start = boundary.end()
        before = text[start:m.start()]
        after = text[m.end():m.end() + 14]
        wanted = _WANTED_BEFORE.search(before) is not None
        held = _HELD_BEFORE.search(before) is not None or _HELD_AFTER.search(after) is not None
        found.append((level, "wanted" if wanted else "held" if held else "plain"))
        previous_end = m.end()
    return found


def level_wish(query: str) -> tuple[str, int | None] | None:
    """What the learner's level words ask for, or None to leave the order alone:
    ("level", n) a level they name or want, ("next", n) the level after the NC n they hold, ("first", None) the
    lowest level (a beginner), ("default", None) nothing said, so the usual order."""
    text = normalize(query)
    mentions = _mentions(text)
    wanted = [level for level, how in mentions if how == "wanted"]
    held = [level for level, how in mentions if how == "held"]
    plain = [level for level, how in mentions if how == "plain"]
    if wanted:
        return "level", wanted[-1]
    if held:
        return "next", held[-1]
    if plain:
        return "level", plain[-1]
    if NEXT_LEVEL.search(text):
        return None  # asks for the next level without saying which one they hold
    if SUPERVISORY.search(text):
        return None  # the usual NC II-first order would work against someone aiming to lead
    if BEGINNER.search(text):
        return "first", None
    return "default", None


_USUAL = {2: 0, 1: 1, 3: 2, 4: 3}  # NC II first, then NC I, III, IV
NEXT_LEVEL_REASON = "The level that fits what you told us about your certificate."


_families_cache: tuple | None = None


def _families(items) -> dict[str, dict[int, object]]:
    """Family -> level -> catalog item; built once per list of items (the catalog snapshot)."""
    global _families_cache
    cached = _families_cache
    if cached is None or cached[0] is not items:
        families: dict[str, dict[int, object]] = {}
        for item in items:
            parsed = level_of(item.summary.name)
            if parsed:
                families.setdefault(parsed[0], {})[parsed[1]] = item
        cached = _families_cache = (items, families)
    return cached[1]


def order_within_families(matches: list, items, query: str) -> list:
    """Reorder (and complete) the matches so that, in each family, the level the learner needs comes first.

    A level the learner asks for, or the one after the NC they hold, is shown even if only a neighbouring level
    scored; a beginner gets the lowest level; otherwise NC II comes first unless the learner describes leading
    others. Other families are untouched; a promoted level takes its family's best score."""
    wish = level_wish(query)
    if wish is None or not matches:
        return matches
    kind, number = wish
    families = _families(items)
    in_family: dict[str, list] = {}
    for m in matches:
        parsed = level_of(m.qualification.name)
        if parsed and len(families.get(parsed[0], {})) > 1:
            in_family.setdefault(parsed[0], []).append(m)
    result = list(matches)
    if kind == "default":
        for members in in_family.values():
            slots = sorted(result.index(m) for m in members)
            scores = sorted((m.score for m in members), reverse=True)
            ordered = sorted(members, key=lambda m: _USUAL.get(level_of(m.qualification.name)[1], 9))
            for slot, m, score in zip(slots, ordered, scores):
                result[slot] = m if m.score == score else m.model_copy(update={"score": score})
        return result
    promoted = []
    for family, members in in_family.items():
        available = families[family]
        if kind == "level":
            target = number if number in available else None
        elif kind == "next":
            above = [level for level in available if level > number]
            target = min(above) if above else None
        else:
            target = min(available)
        if target is None:
            continue
        best = max(m.score for m in members)
        pick = next((m for m in members if level_of(m.qualification.name)[1] == target), None)
        if pick is None:
            item = available[target]
            shape = MatchComponents(keyword=0.0, semantic=0.0) if members[0].components else None
            pick = Match(qualification=item.summary, score=best, reason=NEXT_LEVEL_REASON, components=shape)
            result.append(pick)
        elif pick.score < best:
            replacement = pick.model_copy(update={"score": best})
            result[result.index(pick)] = replacement
            pick = replacement
        promoted.append(pick)
    result.sort(key=lambda m: (-m.score, not any(m is p for p in promoted)))
    return result
