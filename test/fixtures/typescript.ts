export async function getUser(id: any) {
  const res = await fetch("https://api.example.com/users/" + id);
  const data: any = await res.json();
  // @ts-ignore
  console.log(data.name!);
  eval("doThing()");
  return data;
}
