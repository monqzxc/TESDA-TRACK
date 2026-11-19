"""Modelled demand (US-0018), based on TESDA's Area-Based Demand-Driven (ABDD) planning.

Very few qualifications have reviewed links to posting records yet, so without it the Career Map could never show a
demand level or a higher-demand area. With OUTLOOK_SAMPLE_DEMAND_ENABLED on, a qualification with no reviewed
posting record anywhere gets modelled demand instead, worded as demand records, never as postings. Real
records always win: a qualification with even one reviewed posting record is never given sample demand.

The numbers are synthetic, not records. Each region has the priority sectors its ABDD planning names (approximated
here) and a weight for the size of its labor market. A qualification's sample demand in a region is
that weight, raised when the qualification's sector is one of the region's priorities, with a fixed per-pair spread
so neighbouring regions don't read the same. The same qualification and region always get the same number.
"""
import hashlib

# Relative size of each region's labor market.
REGION_WEIGHT = {
    "NCR": 3.5, "IV-A": 3.5, "III": 3.5, "VII": 3.0, "VI": 2.0, "XI": 2.0, "X": 1.6, "I": 1.3, "V": 1.3,
    "XII": 1.2, "NIR": 1.1, "VIII": 1.0, "IX": 1.0, "II": 1.0, "MIMAROPA": 0.9, "CAR": 0.9, "XIII": 0.8,
    "BARMM": 0.8,
}

# Each region's priority sectors, most important first, as named in the catalog's sectors.
AGRI, CONSTRUCTION, TOURISM, ICT = ("Agriculture, Forestry and Fishery", "Construction", "Tourism",
                                    "Information and Communication Technology")
METALS, ELECTRICAL, FOOD, HEALTH = ("Metals and Engineering", "Electrical and Electronics",
                                    "Processed Food and Beverages",
                                    "Health, Social and Other Community Development Services")
PRIORITIES = {
    "NCR": [ICT, "Human Health/Health Care", HEALTH, CONSTRUCTION, TOURISM, "Transport and Logistics",
            "Wholesale and Retail Trading", ELECTRICAL],
    "CAR": [TOURISM, AGRI, FOOD, CONSTRUCTION],
    "I": [AGRI, TOURISM, CONSTRUCTION, FOOD],
    "II": [AGRI, CONSTRUCTION, "Automotive and Land Transportation"],
    "III": [CONSTRUCTION, METALS, ELECTRICAL, "Transport and Logistics", TOURISM, AGRI],
    "IV-A": [ELECTRICAL, "Automotive Manufacturing", METALS, CONSTRUCTION, TOURISM, FOOD],
    "MIMAROPA": [TOURISM, AGRI, "Maritime"],
    "V": [TOURISM, AGRI, CONSTRUCTION],
    "VI": [TOURISM, AGRI, FOOD, ICT],
    "NIR": [AGRI, FOOD, TOURISM],
    "VII": [TOURISM, ICT, CONSTRUCTION, METALS, "Furniture and Fixtures", "Decorative Crafts"],
    "VIII": [AGRI, CONSTRUCTION, "Maritime"],
    "IX": [AGRI, "Maritime", FOOD],
    "X": [AGRI, FOOD, CONSTRUCTION, METALS],
    "XI": [AGRI, TOURISM, ICT, CONSTRUCTION],
    "XII": [AGRI, FOOD, CONSTRUCTION],
    "XIII": [AGRI, CONSTRUCTION, "Utilities", TOURISM],
    "BARMM": [AGRI, CONSTRUCTION, HEALTH, "Garments"],
}
# Records per unit of region weight, and how much a top or other priority sector raises it.
BASE = 10
TOP_PRIORITY, PRIORITY, OTHER = 3.0, 2.0, 1.0


def _spread(qualification_code: str, region_code: str) -> float:
    """A fixed factor between 0.7 and 1.3 for the pair, the same on every run."""
    digest = hashlib.sha256(f"{qualification_code}|{region_code}".encode()).digest()
    return 0.7 + 0.6 * digest[0] / 255


def counts(qualification_code: str, sector: str | None, region_codes: list[str]) -> dict[str, int]:
    """Sample demand for the qualification, by region code: at least 1 in every known region."""
    result = {}
    for code in region_codes:
        priorities = PRIORITIES.get(code, [])
        boost = (TOP_PRIORITY if sector in priorities[:2] else PRIORITY if sector in priorities else OTHER)
        result[code] = max(1, round(BASE * REGION_WEIGHT.get(code, 1.0) * boost * _spread(qualification_code, code)))
    return result
