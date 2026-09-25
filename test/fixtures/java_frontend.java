import java.util.*;
public class Legacy {
  public static Hashtable<String, String> CACHE = new Hashtable<String, String>();
  private Integer boxed = new Integer(5);
  public boolean check(String a, String b) {
    if (a == b) { return true; }
    List raw = new ArrayList();
    StringBuffer sb = new StringBuffer();
    try { Runtime.getRuntime().exec("ls"); } catch (Throwable t) { }
    System.gc();
    return false;
  }
  public String toString() { return "x"; }
}
