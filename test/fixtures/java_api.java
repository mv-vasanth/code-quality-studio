import java.io.*;
import java.text.SimpleDateFormat;
import java.util.concurrent.*;
@Service
public class UserService {
  private SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd");
  private final ExecutorService pool = Executors.newCachedThreadPool();
  private final RestTemplate rest = new RestTemplate();
  public void handle(String fileName) throws Exception {
    Statement st = conn.createStatement();
    st.executeQuery("SELECT * FROM users WHERE id = " + fileName);
    File f = new File(fileName);
    BufferedReader r = new BufferedReader(new FileReader(f));
    try { r.read(); } catch (Exception e) { }
    repo.save(a); repo.save(b);
    log.info("password={}", pw);
    System.out.println("done");
  }
}
