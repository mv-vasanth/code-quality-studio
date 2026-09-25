import io.restassured.RestAssured;
public class ApiTest {
  @Test public void getUser() throws Exception {
    RestAssured.baseURI = "https://staging.api.example.com";
    String token = "Bearer abcdefghijklmnop";
    given().relaxedHTTPSValidation()
      .when().get("/users/1")
      .then().statusCode(200);
    Thread.sleep(1000);
    System.out.println("done");
  }
}
