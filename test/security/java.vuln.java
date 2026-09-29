// Deliberately vulnerable. Each defect is tagged with the rule that must fire.
package com.acme;
import java.sql.*;

public class OrderService {
    private static final String PW = "hunter2";                          // JV-SEC-009

    public void query(Connection c, String id) throws Exception {
        Statement s = c.createStatement();
        s.executeQuery("SELECT * FROM orders WHERE id = '" + id + "'");  // JV-SEC-001
    }

    public void run(String file) throws Exception {
        Runtime.getRuntime().exec("sh -c cat " + file);                  // JV-SEC-010
    }

    public void hash() throws Exception {
        java.security.MessageDigest.getInstance("MD5");                  // JV-SEC-003
    }

    public int token() { return new java.util.Random().nextInt(); }      // JV-SEC-011

    public Object load(java.io.InputStream in) throws Exception {
        return new java.io.ObjectInputStream(in).readObject();           // JV-SEC-006
    }
}
