"""Sign in or create an account; once signed in, the learner's account details."""
import streamlit as st

from portal import session
from portal.account import account_details, account_panel

signed_in = session.account()
if signed_in:
    st.header("Your account")
    account_details(signed_in)
else:
    st.header("Sign in to TESDA Track")
    st.caption("Save your goals, readiness checks and applications. You can use Find my path without an account.")
    with st.container(border=True, key="account_forms"):
        account_panel()
