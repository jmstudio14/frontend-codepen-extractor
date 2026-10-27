#!/usr/bin/env python3
"""Optional semantic judge; requires deepeval and OPENAI_API_KEY."""
import argparse,json,os,sys
from datetime import datetime,timezone
from pathlib import Path
def main():
 p=argparse.ArgumentParser();p.add_argument('--report',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 if not os.getenv('OPENAI_API_KEY'):
  r={'status':'NOT RUN','framework':'DeepEval','reason':'OPENAI_API_KEY missing; no semantic judge invoked.'};Path(a.output).write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(r['reason']);return 0
 try:
  from deepeval.metrics import AnswerRelevancyMetric,GEval
  from deepeval.test_case import LLMTestCase,LLMTestCaseParams
 except ImportError as e: print('DeepEval not installed: '+str(e),file=sys.stderr);return 2
 report=json.loads(Path(a.report).read_text(encoding='utf-8'));results=[]
 for c in report.get('cases',[]):
  answer,prompt=c.get('agent_output'),c.get('prompt')
  if not answer or not prompt:results.append({'id':c.get('id'),'status':'NOT RUN','reason':'Missing captured prompt/output.'});continue
  tc=LLMTestCase(input=prompt,actual_output=answer);metrics=[AnswerRelevancyMetric(threshold=.7,include_reason=True),GEval(name='Task completion and evidence honesty',criteria='Judge whether the answer addresses the task and distinguishes observed evidence, completed checks, and limitations.',evaluation_params=[LLMTestCaseParams.INPUT,LLMTestCaseParams.ACTUAL_OUTPUT],threshold=.7,include_reason=True)];measured=[]
  for m in metrics:
   try:m.measure(tc);measured.append({'name':m.__class__.__name__,'score':m.score,'passed':m.success,'reason':m.reason})
   except Exception as e:measured.append({'name':m.__class__.__name__,'status':'NOT RUN','reason':str(e)[:800]})
  results.append({'id':c.get('id'),'status':'REVIEW','metrics':measured})
 out={'schema_version':1,'framework':'DeepEval','status':'COMPLETED','generated_at':datetime.now(timezone.utc).isoformat(),'cases':results};Path(a.output).write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8');print('DeepEval results written to '+a.output);return 0
if __name__=='__main__':raise SystemExit(main())
