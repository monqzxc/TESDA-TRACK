"""Which training providers and assessment centers learners see (US-0017 AC8).

With CENTER_DATA=official (the default) every active center is listed, as before, except the sample set. With CENTER_DATA=sample only the
labelled sample centers are (data_status "example", loaded by tesda_track.sample_centers): the official lists stay
in the database untouched and come back as soon as the setting does. Every query that lists, counts, ranks or
recommends centers uses listed() in place of `Center.is_active`, so no page can mix the two.
"""
from sqlalchemy import and_, or_

from tesda_track.config import get_settings

SAMPLE_STATUS = "example"
# Marks the sample set (tesda_track.sample_centers): with CENTER_DATA=official it is never listed, even when loaded.
SAMPLE_REFERENCE = "US-0017 AC8: sample centers while TESDA's approval of the official lists is pending"


def sample_mode() -> bool:
    return get_settings().center_data == "sample"


def listed(model):
    """The SQL condition for a TrainingProvider or AssessmentCenter a learner may see."""
    if sample_mode():
        # Only the sample set: other example records (local [Demo]/[Seed] data) don't join it.
        return and_(model.is_active, model.data_status == SAMPLE_STATUS, model.source_reference == SAMPLE_REFERENCE)
    return and_(model.is_active, or_(model.source_reference.is_(None), model.source_reference != SAMPLE_REFERENCE))
