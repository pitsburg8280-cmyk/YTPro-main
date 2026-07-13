package com.google.android.youtube.pro.utils;

import java.security.Security;

public final class NetworkCompat {

    private NetworkCompat() {
    }

    public static synchronized void installConscryptIfAvailable() {
        try {
            if (Security.getProvider("Conscrypt") != null) {
                return;
            }
            Security.insertProviderAt(org.conscrypt.Conscrypt.newProvider(), 1);
        } catch (Throwable ignored) {
            // Keep default TLS provider if Conscrypt is unavailable.
        }
    }
}
