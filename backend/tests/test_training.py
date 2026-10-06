import pytest

CEBU_CITY = (10.3157, 123.8854)
QUEZON_CITY = (14.6760, 121.0437)  # providers made by make_provider() default to Manila


def search(client, **params):
    response = client.get("/api/v1/training-programs", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_regions_are_seeded_with_approximate_centers(client):
    regions = client.get("/api/v1/regions").json()
    assert len(regions) == 18
    assert regions[0]["code"] == "NCR" and regions[0]["center_city"] == "Manila"
    assert all(-90 <= r["latitude"] <= 90 and -180 <= r["longitude"] <= 180 for r in regions)


def test_only_admins_manage_providers(client, learner):
    body = {"name": "Provider", "region_code": "NCR"}
    assert client.post("/api/v1/admin/training-providers", json=body).status_code == 401
    assert client.post("/api/v1/admin/training-providers", headers=learner, json=body).status_code == 403


@pytest.mark.parametrize("body", [
    {"name": "Provider", "region_code": "NOWHERE"},
    {"name": "Provider", "region_code": "NCR", "latitude": 14.6},
    {"name": "Provider", "region_code": "NCR", "latitude": 91, "longitude": 120},
])
def test_provider_needs_a_known_region_and_a_complete_valid_location(client, admin, body):
    assert client.post("/api/v1/admin/training-providers", headers=admin, json=body).status_code == 422


def test_program_is_listed_with_its_provider(client, make_program):
    program = make_program(cost="1500.00", duration_hours=268, scholarship_available=True)
    results = search(client, qualification_code="SMAW-NC-II")
    assert [p["id"] for p in results] == [program["id"]]
    assert results[0]["provider"]["name"] == "Manila Welding Institute"
    assert results[0]["qualification"]["code"] == "SMAW-NC-II"
    assert results[0]["cost"] == "1500.00" and results[0]["distance_km"] is None


@pytest.mark.parametrize("body", [
    {"provider_id": 999999},
    {"qualification_code": "NOPE"},
    {"delivery_mode": "by_carrier_pigeon"},
    {"start_date": "2027-02-01", "end_date": "2027-01-01"},
])
def test_invalid_programs_are_rejected(client, admin, make_provider, body):
    provider = make_provider()
    payload = {"provider_id": provider["id"], "qualification_code": "SMAW-NC-II", "title": "Batch",
               "delivery_mode": "online", **body}
    assert client.post("/api/v1/admin/training-programs", headers=admin, json=payload).status_code == 422


def test_search_filters_by_qualification_and_region(client, make_provider, make_program):
    cebu = make_provider(name="Cebu Skills Center", region_code="VII", location=CEBU_CITY)
    make_program()
    cebu_program = make_program(provider=cebu)
    make_program(qualification_code="CSS-NC-II")
    assert [p["id"] for p in search(client, qualification_code="SMAW-NC-II", region_code="VII")] == [cebu_program["id"]]
    assert len(search(client, qualification_code="SMAW-NC-II")) == 2


def test_nearby_search_orders_by_distance_and_applies_radius(client, make_provider, make_program):
    cebu = make_provider(name="Cebu Skills Center", region_code="VII", location=CEBU_CITY)
    unmapped = make_provider(name="No Address Yet", location=None)
    manila_program = make_program()
    cebu_program = make_program(provider=cebu)
    unmapped_program = make_program(provider=unmapped)

    near = {"near_lat": QUEZON_CITY[0], "near_lon": QUEZON_CITY[1]}
    ordered = search(client, qualification_code="SMAW-NC-II", **near)
    assert [p["id"] for p in ordered] == [manila_program["id"], cebu_program["id"], unmapped_program["id"]]
    # Quezon City to Manila is roughly 11 km; to Cebu City roughly 570 km.
    assert 8 < ordered[0]["distance_km"] < 14
    assert 540 < ordered[1]["distance_km"] < 600
    assert ordered[2]["distance_km"] is None

    within = search(client, qualification_code="SMAW-NC-II", radius_km=50, **near)
    assert [p["id"] for p in within] == [manila_program["id"]]


@pytest.mark.parametrize("params", [{"near_lat": 14.6}, {"radius_km": 10}, {"near_lat": 95, "near_lon": 120}])
def test_nearby_search_needs_a_complete_valid_point(client, params):
    assert client.get("/api/v1/training-programs", params=params).status_code == 422


def test_deactivated_programs_and_providers_are_hidden(client, admin, make_provider, make_program):
    program = make_program()
    other_provider = make_provider(name="Closing Down Institute")
    make_program(provider=other_provider)
    client.patch(f"/api/v1/admin/training-programs/{program['id']}", headers=admin, json={"is_active": False})
    client.patch(f"/api/v1/admin/training-providers/{other_provider['id']}", headers=admin, json={"is_active": False})
    assert search(client, qualification_code="SMAW-NC-II") == []
    assert client.get(f"/api/v1/training-programs/{program['id']}").status_code == 404


def test_admin_updates_program_details(client, admin, make_program):
    program = make_program()
    response = client.patch(f"/api/v1/admin/training-programs/{program['id']}", headers=admin,
                            json={"title": "SMAW NC II Batch 2", "slots": 25})
    assert response.status_code == 200
    assert client.get(f"/api/v1/training-programs/{program['id']}").json()["title"] == "SMAW NC II Batch 2"


def test_provider_location_update_must_stay_complete(client, admin, make_provider):
    provider = make_provider()
    response = client.patch(f"/api/v1/admin/training-providers/{provider['id']}", headers=admin,
                            json={"latitude": None})
    assert response.status_code == 422
    cleared = client.patch(f"/api/v1/admin/training-providers/{provider['id']}", headers=admin,
                           json={"latitude": None, "longitude": None})
    assert cleared.status_code == 200 and cleared.json()["latitude"] is None
