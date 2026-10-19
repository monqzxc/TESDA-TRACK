def generate_career_path(qualification: dict, user_profile: dict) -> dict:
    """Read the sample career information for the learner's selected qualification."""
    jobs = qualification.get("possible_jobs", [])
    return {
        "career_goal": user_profile.get("career_goal") or (jobs[0] if jobs else "Explore a career"),
        "qualification": {"code": qualification["code"], "name": qualification["name"]},
        "pathway": list(qualification.get("pathway", [])),
        "possible_jobs": list(jobs),
        "related_qualifications": list(qualification.get("related_qualifications", [])),
    }
