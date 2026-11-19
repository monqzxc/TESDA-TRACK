URL = "/api/v1/me/saved-centers"


def save(client, headers, center_id, **body):
    return client.put(f"{URL}/{center_id}", headers=headers, json=body or None)


def test_saving_needs_an_account(client, make_provider):
    provider = make_provider()
    assert client.get(URL).status_code == 401
    assert save(client, {}, f"training-{provider['id']}").status_code == 401


def test_learner_saves_a_center_with_the_qualification_they_were_exploring(client, learner, make_center):
    center = make_center(name="Albuera Assessment Center", contact_phone="053-562-9731")
    response = save(client, learner, f"assessment-{center['id']}", qualification_code="SMAW-NC-II")
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["center_id"] == f"assessment-{center['id']}" and saved["kind"] == "assessment"
    assert saved["name"] == "Albuera Assessment Center" and saved["contact_phone"] == "053-562-9731"
    assert saved["website"] is None and saved["is_active"] is True
    assert saved["qualification"]["code"] == "SMAW-NC-II"
    assert [s["center_id"] for s in client.get(URL, headers=learner).json()] == [saved["center_id"]]


def test_saving_again_is_idempotent_and_keeps_the_qualification_unless_given(client, learner, make_provider):
    center_id = f"training-{make_provider()['id']}"
    first = save(client, learner, center_id, qualification_code="SMAW-NC-II").json()
    again = save(client, learner, center_id).json()
    assert again["saved_at"] == first["saved_at"] and again["qualification"]["code"] == "SMAW-NC-II"
    cleared = save(client, learner, center_id, qualification_code=None).json()
    assert cleared["qualification"] is None
    assert len(client.get(URL, headers=learner).json()) == 1


def test_training_and_assessment_sites_with_the_same_number_are_different_centers(
        client, learner, make_provider, make_center):
    provider, center = make_provider(), make_center()
    save(client, learner, f"training-{provider['id']}")
    save(client, learner, f"assessment-{center['id']}")
    listed = {s["center_id"] for s in client.get(URL, headers=learner).json()}
    assert listed == {f"training-{provider['id']}", f"assessment-{center['id']}"}


def test_saved_centers_are_private_and_listed_newest_first(client, learner, other_learner, make_provider):
    first, second = make_provider(name="First"), make_provider(name="Second")
    save(client, learner, f"training-{first['id']}")
    save(client, learner, f"training-{second['id']}")
    save(client, other_learner, f"training-{first['id']}")
    assert [s["name"] for s in client.get(URL, headers=learner).json()] == ["Second", "First"]
    assert [s["name"] for s in client.get(URL, headers=other_learner).json()] == ["First"]


def test_removing_a_center_is_idempotent(client, learner, make_provider):
    center_id = f"training-{make_provider()['id']}"
    save(client, learner, center_id)
    assert client.delete(f"{URL}/{center_id}", headers=learner).status_code == 204
    assert client.delete(f"{URL}/{center_id}", headers=learner).status_code == 204
    assert client.get(URL, headers=learner).json() == []


def test_unknown_centers_ids_and_qualifications_are_rejected(client, learner, make_provider):
    assert save(client, learner, "training-999999").status_code == 404
    assert save(client, learner, "school-1").status_code == 422
    assert save(client, learner, "training-0").status_code == 422
    center_id = f"training-{make_provider()['id']}"
    assert save(client, learner, center_id, qualification_code="ASTRONAUT-NC-IV").status_code == 422


def test_saved_centers_are_in_the_data_export(client, learner, make_center):
    center = make_center()
    save(client, learner, f"assessment-{center['id']}")
    exported = client.get("/api/v1/me/export", headers=learner).json()
    assert [s["center_id"] for s in exported["saved_centers"]] == [f"assessment-{center['id']}"]
