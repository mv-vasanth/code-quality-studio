// The correct form of every defect in java.vuln.java. Must report no security
// findings — a rule that flags this is teaching people to break working code.
package com.acme;
import java.sql.*;
import java.security.SecureRandom;

public class OrderService {
    private final String password = System.getenv("DB_PASSWORD");

    public void query(Connection c, String id) throws Exception {
        PreparedStatement s = c.prepareStatement("SELECT * FROM orders WHERE id = ?");
        s.setString(1, id);
        s.executeQuery();
    }

    public void run(String file) throws Exception {
        new ProcessBuilder("cat", file).start();
    }

    public void hash() throws Exception {
        java.security.MessageDigest.getInstance("SHA-256");
    }

    private static final SecureRandom RANDOM = new SecureRandom();
    public int token() { return RANDOM.nextInt(); }
}
