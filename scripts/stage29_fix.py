import json, pathlib
path=pathlib.Path('public/content/modules/architecture-patterns.json')
data=json.loads(path.read_text(encoding='utf-8'))
lesson=next(item for item in data['lessons'] if item['id']=='advanced.arch.coupling')
lesson['debugging']={
  'errorType':'TightCoupling',
  'symptom':'RaporServisi kendi Repository nesnesini oluşturduğu için sahte repository ile test edilemiyor.',
  'workflow':['Bağımlılığın nerede oluşturulduğunu belirle.','Repository nesnesini __init__ parametresi olarak dışarıdan al.','Servisi sahte repository ile yeniden çalıştır.']
}
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
