"""AppTest harness: reopen the real dialog during AppTest's full-script reruns."""
from pathlib import Path
import runpy

import streamlit as st

ui = runpy.run_path(str(Path(__file__).resolve().parents[2] / "app.py"))
with st.sidebar:
    ui["show_account"]()
if not st.session_state.get("auth"):
    ui["show_account_dialog"]()
